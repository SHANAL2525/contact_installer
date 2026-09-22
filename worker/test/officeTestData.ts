import { env } from 'cloudflare:test'
import type { OfficeRole } from '../src/repositories/officeAccess'
import { createApplicationSession } from '../src/repositories/sessions'
import { createUserFromVerifiedIdentity } from '../src/repositories/users'
import { sha256Base64Url } from '../src/security/crypto'

export const syntheticNow = '2026-01-01T00:00:00.000Z'

export async function clearDatabase(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM oauth_login_transactions'),
    env.DB.prepare('DELETE FROM save_events'),
    env.DB.prepare('DELETE FROM saved_contacts'),
    env.DB.prepare('DELETE FROM import_destinations'),
    env.DB.prepare('DELETE FROM import_batches'),
    env.DB.prepare('DELETE FROM google_accounts'),
    env.DB.prepare('DELETE FROM app_sessions'),
    env.DB.prepare('DELETE FROM office_access'),
    env.DB.prepare('DELETE FROM users'),
  ])
}
export async function seedPendingInvitation(input: {
  id: string
  email: string
  role?: OfficeRole
  invitedAt?: string
}): Promise<void> {
  const invitedAt = input.invitedAt ?? syntheticNow
  await env.DB.prepare(`
    INSERT INTO office_access (
      id, invited_email, invited_email_normalized, role, status, invited_at, updated_at
    ) VALUES (?, ?, ?, ?, 'pending', ?, ?)
  `).bind(
    input.id,
    input.email,
    input.email.trim().toLowerCase(),
    input.role ?? 'staff',
    invitedAt,
    invitedAt,
  ).run()
}

export async function seedActiveOfficeUser(input: {
  accessId: string
  userId: string
  googleSub: string
  email: string
  role?: OfficeRole
  displayName?: string
  now?: string
}): Promise<void> {
  const now = input.now ?? syntheticNow
  await createUserFromVerifiedIdentity(env.DB, {
    id: input.userId,
    googleSub: input.googleSub,
    primaryEmail: input.email,
    displayName: input.displayName ?? input.userId,
    now,
  })
  await env.DB.prepare(`
    INSERT INTO office_access (
      id, invited_email, invited_email_normalized, user_id, google_sub,
      role, status, invited_at, activated_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `).bind(
    input.accessId,
    input.email,
    input.email.trim().toLowerCase(),
    input.userId,
    input.googleSub,
    input.role ?? 'staff',
    now,
    now,
    now,
  ).run()
}

export async function seedApplicationSession(input: {
  sessionId: string
  userId: string
  sessionToken: string
  csrfToken: string
  expiresAt?: string
  now?: string
}): Promise<void> {
  const now = input.now ?? syntheticNow
  await createApplicationSession(env.DB, {
    id: input.sessionId,
    userId: input.userId,
    sessionTokenHash: await sha256Base64Url(input.sessionToken),
    csrfSecretHash: await sha256Base64Url(input.csrfToken),
    createdAt: now,
    expiresAt: input.expiresAt ?? '2099-01-01T00:00:00.000Z',
  })
}

export function officeCookies(sessionToken: string, csrfToken: string): string {
  return `cas_session=${sessionToken}; cas_csrf=${csrfToken}`
}
