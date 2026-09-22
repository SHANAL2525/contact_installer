import type { RequestContext } from '../env'
import { jsonResponse } from '../http'
import { requireCsrfProtection } from '../middleware/csrf'
import { validateApplicationSession } from '../middleware/session'
import {
  consumeOAuthLoginTransaction,
  createOAuthLoginTransaction,
  findActiveOAuthLoginTransaction,
} from '../repositories/authTransactions'
import {
  createApplicationSession,
  revokeApplicationSession,
  updateSessionCsrfHash,
} from '../repositories/sessions'
import { authorizeVerifiedOfficeIdentity } from '../repositories/officeAccess'
import {
  clearOAuthTransactionCookie,
  clearSessionCookies,
  createCsrfCookie,
  createOAuthTransactionCookie,
  createSessionCookie,
  CSRF_COOKIE_NAME,
  OAUTH_TRANSACTION_COOKIE_NAME,
  readCookie,
} from '../security/cookies'
import { randomBase64Url, sha256Base64Url, timingSafeEqual } from '../security/crypto'
import {
  type GoogleIdentityVerifier,
  JoseGoogleIdentityVerifier,
} from '../services/googleIdentity'
import {
  FetchGoogleAuthorizationCodeExchanger,
  type GoogleAuthorizationCodeExchanger,
  getGoogleAuthorizationUrl,
  requireGoogleLoginConfig,
} from '../services/googleOidc'

const OAUTH_TRANSACTION_TTL_SECONDS = 600
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com'])

export interface AuthRouteDependencies {
  now: () => Date
  exchanger: GoogleAuthorizationCodeExchanger
  identityVerifier: GoogleIdentityVerifier
}

const defaultDependencies: AuthRouteDependencies = {
  now: () => new Date(),
  exchanger: new FetchGoogleAuthorizationCodeExchanger(),
  identityVerifier: new JoseGoogleIdentityVerifier(),
}

export async function handleAuthRoute(
  context: RequestContext,
  dependencies: AuthRouteDependencies = defaultDependencies,
): Promise<Response> {
  const url = new URL(context.request.url)

  if (url.pathname === '/api/auth/google/start') {
    return context.request.method === 'GET'
      ? startGoogleLogin(context, url, dependencies)
      : methodNotAllowed('GET')
  }

  if (url.pathname === '/api/auth/google/callback') {
    return context.request.method === 'GET'
      ? completeGoogleLogin(context, url, dependencies)
      : methodNotAllowed('GET')
  }

  if (url.pathname === '/api/session') {
    return context.request.method === 'GET'
      ? readApplicationSession(context, dependencies)
      : methodNotAllowed('GET')
  }

  if (url.pathname === '/api/logout') {
    return context.request.method === 'POST'
      ? logout(context, dependencies)
      : methodNotAllowed('POST')
  }

  return jsonResponse({ error: 'not_found' }, 404)
}

async function startGoogleLogin(
  context: RequestContext,
  url: URL,
  dependencies: AuthRouteDependencies,
): Promise<Response> {
  const config = requireGoogleLoginConfig(context.env)
  const now = dependencies.now()
  const state = randomBase64Url()
  const nonce = randomBase64Url()
  const codeVerifier = randomBase64Url(64)
  const transactionToken = randomBase64Url()
  const expiresAt = new Date(now.getTime() + OAUTH_TRANSACTION_TTL_SECONDS * 1000)
  const returnPath = normalizeReturnPath(url.searchParams.get('return_to'))

  await createOAuthLoginTransaction(context.env.DB, {
    id: crypto.randomUUID(),
    transactionTokenHash: await sha256Base64Url(transactionToken),
    stateHash: await sha256Base64Url(state),
    nonceHash: await sha256Base64Url(nonce),
    codeVerifier,
    redirectUri: config.redirectUri,
    returnPath,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  })

  const location = getGoogleAuthorizationUrl({
    config,
    state,
    nonce,
    codeChallenge: await sha256Base64Url(codeVerifier),
  })
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' })
  headers.append(
    'Set-Cookie',
    createOAuthTransactionCookie(context.env, transactionToken, OAUTH_TRANSACTION_TTL_SECONDS),
  )
  return new Response(null, { status: 302, headers })
}

async function completeGoogleLogin(
  context: RequestContext,
  url: URL,
  dependencies: AuthRouteDependencies,
): Promise<Response> {
  const config = requireGoogleLoginConfig(context.env)
  const failureRedirect = new URL('/login?error=authentication_failed', config.frontendOrigin)
  const accessDeniedRedirect = new URL('/login?error=access_denied', config.frontendOrigin)
  const transactionToken = readCookie(context.request, OAUTH_TRANSACTION_COOKIE_NAME)

  if (!transactionToken) {
    return oauthFailureRedirect(context, failureRedirect)
  }

  const now = dependencies.now()
  const transaction = await findActiveOAuthLoginTransaction(
    context.env.DB,
    await sha256Base64Url(transactionToken),
    now.toISOString(),
  )

  if (!transaction || !transaction.code_verifier) {
    return oauthFailureRedirect(context, failureRedirect)
  }

  const state = url.searchParams.get('state')
  const stateMatches = state !== null && timingSafeEqual(
    await sha256Base64Url(state),
    transaction.state_hash,
  )
  const consumed = await consumeOAuthLoginTransaction(
    context.env.DB,
    transaction.id,
    now.toISOString(),
  )

  if (!consumed || !stateMatches) {
    return oauthFailureRedirect(context, failureRedirect)
  }

  const issuer = url.searchParams.get('iss')
  const code = url.searchParams.get('code')

  if (
    url.searchParams.has('error')
    || !code
    || (issuer !== null && !GOOGLE_ISSUERS.has(issuer))
    || transaction.redirect_uri !== config.redirectUri
  ) {
    return oauthFailureRedirect(context, failureRedirect)
  }

  try {
    const { idToken } = await dependencies.exchanger.exchange({
      code,
      codeVerifier: transaction.code_verifier,
      config,
    })
    const identity = await dependencies.identityVerifier.verifyIdToken({
      idToken,
      audience: config.clientId,
      expectedNonceHash: transaction.nonce_hash,
      now,
    })
    const authorized = await authorizeVerifiedOfficeIdentity(context.env.DB, {
      userId: crypto.randomUUID(),
      googleSub: identity.sub,
      email: identity.email,
      displayName: identity.displayName,
      now: now.toISOString(),
    })

    if (!authorized) {
      return oauthFailureRedirect(context, accessDeniedRedirect)
    }

    const sessionToken = randomBase64Url()
    const csrfToken = randomBase64Url()

    await createApplicationSession(context.env.DB, {
      id: crypto.randomUUID(),
      userId: authorized.user.id,
      sessionTokenHash: await sha256Base64Url(sessionToken),
      csrfSecretHash: await sha256Base64Url(csrfToken),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + config.sessionTtlSeconds * 1000).toISOString(),
    })

    const destination = new URL(transaction.return_path, config.frontendOrigin)
    const headers = new Headers({ Location: destination.toString(), 'Cache-Control': 'no-store' })
    headers.append('Set-Cookie', clearOAuthTransactionCookie(context.env))
    headers.append(
      'Set-Cookie',
      createSessionCookie(context.env, sessionToken, config.sessionTtlSeconds),
    )
    headers.append(
      'Set-Cookie',
      createCsrfCookie(context.env, csrfToken, config.sessionTtlSeconds),
    )
    return new Response(null, { status: 302, headers })
  } catch {
    return oauthFailureRedirect(context, failureRedirect)
  }
}

async function readApplicationSession(
  context: RequestContext,
  dependencies: AuthRouteDependencies,
): Promise<Response> {
  const validation = await validateApplicationSession(
    context.request,
    context.env,
    dependencies.now(),
  )

  if (!validation.ok) {
    const response = validation.response
    clearSessionCookies(context.env).forEach((cookie) => response.headers.append('Set-Cookie', cookie))
    return response
  }

  const configuredTtl = requireGoogleLoginConfig(context.env).sessionTtlSeconds
  let csrfToken = readCookie(context.request, CSRF_COOKIE_NAME)
  let responseCookie: string | null = null

  if (
    !csrfToken
    || !timingSafeEqual(await sha256Base64Url(csrfToken), validation.user.csrfSecretHash)
  ) {
    csrfToken = randomBase64Url()
    await updateSessionCsrfHash(
      context.env.DB,
      validation.user.sessionId,
      await sha256Base64Url(csrfToken),
    )
    responseCookie = createCsrfCookie(context.env, csrfToken, configuredTtl)
  }

  const response = jsonResponse({
    authenticated: true,
    user: {
      displayName: validation.user.displayName,
      email: validation.user.email,
      role: validation.user.role,
    },
    csrfToken,
  })

  if (responseCookie) {
    response.headers.append('Set-Cookie', responseCookie)
  }
  return response
}

async function logout(
  context: RequestContext,
  dependencies: AuthRouteDependencies,
): Promise<Response> {
  const validation = await validateApplicationSession(
    context.request,
    context.env,
    dependencies.now(),
  )

  if (!validation.ok) {
    const response = validation.response
    clearSessionCookies(context.env).forEach((cookie) => response.headers.append('Set-Cookie', cookie))
    return response
  }

  const csrfFailure = await requireCsrfProtection(
    context.request,
    context.env,
    validation.user,
  )

  if (csrfFailure) {
    return csrfFailure
  }

  await revokeApplicationSession(
    context.env.DB,
    validation.user.sessionId,
    dependencies.now().toISOString(),
  )
  const response = new Response(null, { status: 204 })
  clearSessionCookies(context.env).forEach((cookie) => response.headers.append('Set-Cookie', cookie))
  return response
}

function oauthFailureRedirect(context: RequestContext, destination: URL): Response {
  const headers = new Headers({ Location: destination.toString(), 'Cache-Control': 'no-store' })
  headers.append('Set-Cookie', clearOAuthTransactionCookie(context.env))
  return new Response(null, { status: 302, headers })
}

function normalizeReturnPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/'
  }

  try {
    const parsed = new URL(value, 'https://return-path.invalid')
    return parsed.origin === 'https://return-path.invalid'
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : '/'
  } catch {
    return '/'
  }
}

function methodNotAllowed(allowedMethod: string): Response {
  return jsonResponse({ error: 'method_not_allowed' }, 405, { Allow: allowedMethod })
}
