import type { Env } from '../env'
import { HttpError } from '../middleware/errorHandler'

const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

export interface GoogleLoginConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  frontendOrigin: string
  sessionTtlSeconds: number
}

export interface ExchangeAuthorizationCodeInput {
  code: string
  codeVerifier: string
  config: GoogleLoginConfig
}

export interface GoogleAuthorizationCodeExchanger {
  exchange(input: ExchangeAuthorizationCodeInput): Promise<{ idToken: string }>
}

export function getGoogleAuthorizationUrl(input: {
  config: GoogleLoginConfig
  state: string
  nonce: string
  codeChallenge: string
}): string {
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT)
  url.searchParams.set('client_id', input.config.clientId)
  url.searchParams.set('redirect_uri', input.config.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', input.state)
  url.searchParams.set('nonce', input.nonce)
  url.searchParams.set('code_challenge', input.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('prompt', 'select_account')
  return url.toString()
}

export class FetchGoogleAuthorizationCodeExchanger
implements GoogleAuthorizationCodeExchanger {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async exchange(input: ExchangeAuthorizationCodeInput): Promise<{ idToken: string }> {
    const body = new URLSearchParams({
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      code: input.code,
      code_verifier: input.codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: input.config.redirectUri,
    })
    const response = await this.fetcher(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    if (!response.ok) {
      throw new Error('Google authorization-code exchange failed.')
    }

    const payload = await response.json() as { id_token?: unknown }

    if (typeof payload.id_token !== 'string' || !payload.id_token) {
      throw new Error('Google did not return an ID token.')
    }

    return { idToken: payload.id_token }
  }
}

export function requireGoogleLoginConfig(env: Env): GoogleLoginConfig {
  const clientId = env.GOOGLE_LOGIN_CLIENT_ID?.trim()
  const clientSecret = env.GOOGLE_LOGIN_CLIENT_SECRET?.trim()
  const redirectUri = env.GOOGLE_LOGIN_REDIRECT_URI?.trim()
  const frontendOrigin = env.FRONTEND_ORIGIN?.trim()

  if (!clientId || !clientSecret || !redirectUri || !frontendOrigin) {
    throw new HttpError(
      503,
      'authentication_not_configured',
      'Application login is not configured.',
    )
  }

  const redirectUrl = parseConfiguredUrl(redirectUri)
  const frontendUrl = parseConfiguredUrl(frontendOrigin)

  if (
    env.APP_ENV !== 'local'
    && (redirectUrl.protocol !== 'https:' || frontendUrl.protocol !== 'https:')
  ) {
    throw new HttpError(
      503,
      'authentication_not_configured',
      'Production authentication URLs must use HTTPS.',
    )
  }

  if (env.APP_ENV === 'local') {
    assertLocalDevelopmentUrl(redirectUrl)
    assertLocalDevelopmentUrl(frontendUrl)
  }

  const configuredTtl = Number(env.SESSION_TTL_SECONDS ?? '28800')
  const sessionTtlSeconds = Number.isInteger(configuredTtl)
    ? Math.min(Math.max(configuredTtl, 300), 604800)
    : 28800

  return {
    clientId,
    clientSecret,
    redirectUri: redirectUrl.toString(),
    frontendOrigin: frontendUrl.origin,
    sessionTtlSeconds,
  }
}

function parseConfiguredUrl(value: string): URL {
  try {
    return new URL(value)
  } catch {
    throw new HttpError(
      503,
      'authentication_not_configured',
      'Application login URL configuration is invalid.',
    )
  }
}

function assertLocalDevelopmentUrl(url: URL): void {
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

  if (url.protocol !== 'https:' && !localHosts.has(url.hostname)) {
    throw new HttpError(
      503,
      'authentication_not_configured',
      'Insecure authentication URLs are allowed only on localhost.',
    )
  }
}
