import type { AuthenticatedUser, Env } from '../env'
import { jsonResponse } from '../http'
import { findActiveSessionByTokenHash, touchApplicationSession } from '../repositories/sessions'
import { readCookie, SESSION_COOKIE_NAME } from '../security/cookies'
import { sha256Base64Url } from '../security/crypto'

export type SessionValidationResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: Response }

export async function validateApplicationSession(
  request: Request,
  env: Env,
  now = new Date(),
): Promise<SessionValidationResult> {
  const sessionToken = readCookie(request, SESSION_COOKIE_NAME)

  if (!sessionToken) {
    return unauthorizedResponse()
  }

  const sessionTokenHash = await sha256Base64Url(sessionToken)
  const session = await findActiveSessionByTokenHash(
    env.DB,
    sessionTokenHash,
    now.toISOString(),
  )

  if (!session) {
    return unauthorizedResponse()
  }

  await touchApplicationSession(env.DB, session.session_id, now.toISOString())

  return {
    ok: true,
    user: {
      id: session.user_id,
      googleSub: session.google_sub,
      sessionId: session.session_id,
      email: session.primary_email,
      displayName: session.display_name,
      csrfSecretHash: session.csrf_secret_hash,
      expiresAt: session.expires_at,
      officeAccessId: session.office_access_id,
      role: session.office_role,
    },
  }
}

function unauthorizedResponse(): SessionValidationResult {
  return {
    ok: false,
    response: jsonResponse({
      error: 'unauthorized',
      message: 'A valid application session is required.',
    }, 401),
  }
}
