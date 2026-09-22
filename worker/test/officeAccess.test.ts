import { env, SELF } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearDatabase,
  officeCookies,
  seedActiveOfficeUser,
  seedApplicationSession,
} from './officeTestData'

const ownerHeaders = {
  Cookie: officeCookies('owner-session-token', 'owner-csrf-token'),
  Origin: 'http://localhost:5173',
  'X-CSRF-Token': 'owner-csrf-token',
}

beforeEach(async () => {
  await clearDatabase()
  await seedActiveOfficeUser({
    accessId: 'owner-access',
    userId: 'owner-user',
    googleSub: 'owner-google-sub',
    email: 'owner@example.invalid',
    role: 'owner',
    displayName: 'Office Owner',
  })
  await seedApplicationSession({
    sessionId: 'owner-session',
    userId: 'owner-user',
    sessionToken: 'owner-session-token',
    csrfToken: 'owner-csrf-token',
  })
  await seedActiveOfficeUser({
    accessId: 'staff-access',
    userId: 'staff-user',
    googleSub: 'staff-google-sub',
    email: 'staff@example.invalid',
    role: 'staff',
    displayName: 'Office Staff',
  })
  await seedApplicationSession({
    sessionId: 'staff-session',
    userId: 'staff-user',
    sessionToken: 'staff-session-token',
    csrfToken: 'staff-csrf-token',
  })
})
describe('office access management', () => {
  it('allows the owner to list access without exposing Google subs', async () => {
    const response = await SELF.fetch('http://localhost:8787/api/office-users', {
      headers: { Cookie: ownerHeaders.Cookie },
    })
    const payload = await response.json<{ users: Array<{ email: string; role: string }> }>()

    expect(response.status).toBe(200)
    expect(payload.users).toHaveLength(2)
    expect(payload.users).toEqual(expect.arrayContaining([
      expect.objectContaining({ email: 'owner@example.invalid', role: 'owner' }),
      expect.objectContaining({ email: 'staff@example.invalid', role: 'staff' }),
    ]))
    expect(JSON.stringify(payload)).not.toContain('google-sub')
  })

  it('allows the owner to add an exact pending staff invitation', async () => {
    const response = await SELF.fetch('http://localhost:8787/api/office-users/invitations', {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: ' New.Staff@Example.invalid ' }),
    })
    const invitation = await env.DB.prepare(`
      SELECT invited_email_normalized, role, status, user_id, google_sub
      FROM office_access
      WHERE invited_email_normalized = 'new.staff@example.invalid'
    `).first<{
      invited_email_normalized: string
      role: string
      status: string
      user_id: string | null
      google_sub: string | null
    }>()

    expect(response.status).toBe(201)
    expect(invitation).toEqual({
      invited_email_normalized: 'new.staff@example.invalid',
      role: 'staff',
      status: 'pending',
      user_id: null,
      google_sub: null,
    })
  })

  it('denies staff access to owner management endpoints', async () => {
    const response = await SELF.fetch('http://localhost:8787/api/office-users', {
      headers: {
        Cookie: officeCookies('staff-session-token', 'staff-csrf-token'),
      },
    })

    expect(response.status).toBe(403)
    expect(await response.json<{ error: string }>()).toMatchObject({ error: 'forbidden' })
  })

  it('revokes staff membership and every active application session', async () => {
    const revoke = await SELF.fetch(
      'http://localhost:8787/api/office-users/staff-access/revoke',
      { method: 'POST', headers: ownerHeaders },
    )
    const session = await env.DB.prepare(`
      SELECT revoked_at FROM app_sessions WHERE id = 'staff-session'
    `).first<{ revoked_at: string | null }>()
    const access = await env.DB.prepare(`
      SELECT status, revoked_at FROM office_access WHERE id = 'staff-access'
    `).first<{ status: string; revoked_at: string | null }>()
    const afterRevocation = await SELF.fetch('http://localhost:8787/api/session', {
      headers: { Cookie: officeCookies('staff-session-token', 'staff-csrf-token') },
    })
    const protectedAsset = await SELF.fetch('http://localhost:8787/assets/application.js', {
      headers: {
        Accept: 'application/javascript',
        Cookie: officeCookies('staff-session-token', 'staff-csrf-token'),
      },
    })

    expect(revoke.status).toBe(204)
    expect(access?.status).toBe('revoked')
    expect(access?.revoked_at).toBeTruthy()
    expect(session?.revoked_at).toBeTruthy()
    expect(afterRevocation.status).toBe(401)
    expect(protectedAsset.status).toBe(401)
  })

  it('prevents revocation of the last active owner', async () => {
    const response = await SELF.fetch(
      'http://localhost:8787/api/office-users/owner-access/revoke',
      { method: 'POST', headers: ownerHeaders },
    )

    expect(response.status).toBe(409)
    expect(await response.json<{ error: string }>()).toMatchObject({ error: 'last_owner' })
  })
})
