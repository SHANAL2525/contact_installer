import type { AuthenticatedUser, Env } from '../env'
import { jsonResponse } from '../http'
import { CSRF_COOKIE_NAME, readCookie } from '../security/cookies'
import { sha256Base64Url, timingSafeEqual } from '../security/crypto'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export async function requireCsrfProtection(
  request: Request,
  env: Env,
  user: AuthenticatedUser,
): Promise<Response | null> {
  if (SAFE_METHODS.has(request.method)) {
    return null
  }

  const requestOrigin = request.headers.get('Origin')
  const configuredOrigin = env.FRONTEND_ORIGIN?.trim()

  if (!requestOrigin || !configuredOrigin || requestOrigin !== configuredOrigin) {
    return csrfRejected()
  }

  const headerToken = request.headers.get('X-CSRF-Token')
  const cookieToken = readCookie(request, CSRF_COOKIE_NAME)

  if (!headerToken || !cookieToken || !timingSafeEqual(headerToken, cookieToken)) {
    return csrfRejected()
  }

  const receivedHash = await sha256Base64Url(headerToken)

  return timingSafeEqual(receivedHash, user.csrfSecretHash)
    ? null
    : csrfRejected()
}

function csrfRejected(): Response {
  return jsonResponse({
    error: 'csrf_rejected',
    message: 'The request could not be verified.',
  }, 403)
}
