import type { Env } from '../env'

export const SESSION_COOKIE_NAME = 'cas_session'
export const CSRF_COOKIE_NAME = 'cas_csrf'
export const OAUTH_TRANSACTION_COOKIE_NAME = 'cas_oauth_tx'

export function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('Cookie')

  if (!cookieHeader) {
    return null
  }

  for (const pair of cookieHeader.split(';')) {
    const separatorIndex = pair.indexOf('=')

    if (separatorIndex < 0) {
      continue
    }

    const key = pair.slice(0, separatorIndex).trim()

    if (key === name) {
      return decodeURIComponent(pair.slice(separatorIndex + 1).trim())
    }
  }

  return null
}
export function createSessionCookie(
  env: Env,
  value: string,
  maxAgeSeconds: number,
): string {
  return serializeCookie(env, SESSION_COOKIE_NAME, value, {
    httpOnly: true,
    maxAgeSeconds,
    path: '/',
    sameSite: 'Lax',
  })
}

export function createCsrfCookie(
  env: Env,
  value: string,
  maxAgeSeconds: number,
): string {
  return serializeCookie(env, CSRF_COOKIE_NAME, value, {
    httpOnly: false,
    maxAgeSeconds,
    path: '/',
    sameSite: 'Strict',
  })
}

export function createOAuthTransactionCookie(
  env: Env,
  value: string,
  maxAgeSeconds: number,
): string {
  return serializeCookie(env, OAUTH_TRANSACTION_COOKIE_NAME, value, {
    httpOnly: true,
    maxAgeSeconds,
    path: '/api/auth/google',
    sameSite: 'Lax',
  })
}

export function clearSessionCookies(env: Env): string[] {
  return [
    serializeCookie(env, SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      maxAgeSeconds: 0,
      path: '/',
      sameSite: 'Lax',
    }),
    serializeCookie(env, CSRF_COOKIE_NAME, '', {
      httpOnly: false,
      maxAgeSeconds: 0,
      path: '/',
      sameSite: 'Strict',
    }),
  ]
}

export function clearOAuthTransactionCookie(env: Env): string {
  return serializeCookie(env, OAUTH_TRANSACTION_COOKIE_NAME, '', {
    httpOnly: true,
    maxAgeSeconds: 0,
    path: '/api/auth/google',
    sameSite: 'Lax',
  })
}

type CookieOptions = {
  httpOnly: boolean
  maxAgeSeconds: number
  path: string
  sameSite: 'Lax' | 'Strict'
}

function serializeCookie(
  env: Env,
  name: string,
  value: string,
  options: CookieOptions,
): string {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path}`,
    `Max-Age=${options.maxAgeSeconds}`,
    `SameSite=${options.sameSite}`,
  ]

  if (options.httpOnly) {
    attributes.push('HttpOnly')
  }

  if (env.APP_ENV !== 'local') {
    attributes.push('Secure')
  }

  return attributes.join('; ')
}
