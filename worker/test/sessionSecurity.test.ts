import { env, SELF } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Env } from '../src/env'
import { createSessionCookie } from '../src/security/cookies'
import {
  clearDatabase,
  officeCookies,
  seedActiveOfficeUser,
  seedApplicationSession,
} from './officeTestData'

const workerEnv = env as unknown as Env

async function seedSession(input: {
  userId: string
  googleSub: string
  email: string
  sessionToken: string
  csrfToken: string
  expiresAt?: string
}) {
  await seedActiveOfficeUser({
    accessId: `access-${input.userId}`,
    userId: input.userId,
    googleSub: input.googleSub,
    email: input.email,
    displayName: input.userId,
  })
  await seedApplicationSession({
    sessionId: `session-${input.userId}`,
    userId: input.userId,
    sessionToken: input.sessionToken,
    csrfToken: input.csrfToken,
    expiresAt: input.expiresAt ?? '2099-01-01T00:00:00.000Z',
  })
}

beforeEach(clearDatabase)

describe('application session security', () => {
  it('marks production session cookies HttpOnly, Secure, host-only, and SameSite=Lax', () => {
    const cookie = createSessionCookie(
      { ...workerEnv, APP_ENV: 'production' },
      'opaque-session-token',
      3600,
    )

    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    expect(cookie).not.toContain('Domain=')
  })

  it('accepts a valid opaque cookie and never trusts a client-supplied user id', async () => {
    await seedSession({
      userId: 'user-a',
      googleSub: 'sub-a',
      email: 'user-a@example.invalid',
      sessionToken: 'session-token-a',
      csrfToken: 'csrf-token-a',
    })
    await seedSession({
      userId: 'user-b',
      googleSub: 'sub-b',
      email: 'user-b@example.invalid',
      sessionToken: 'session-token-b',
      csrfToken: 'csrf-token-b',
    })

    const response = await SELF.fetch(
      'http://localhost:8787/api/session?user_id=user-b',
      {
        headers: {
          Cookie: officeCookies('session-token-a', 'csrf-token-a'),
          'X-User-Id': 'user-b',
        },
      },
    )
    const payload = await response.json<{
      user: { email: string }
      csrfToken: string
    }>()

    expect(response.status).toBe(200)
    expect(payload.user.email).toBe('user-a@example.invalid')
    expect(payload.csrfToken).toBe('csrf-token-a')
    expect(JSON.stringify(payload)).not.toContain('sub-a')
  })

  it('rejects forged and expired session cookies', async () => {
    await seedSession({
      userId: 'expired-user',
      googleSub: 'expired-sub',
      email: 'expired@example.invalid',
      sessionToken: 'expired-session-token',
      csrfToken: 'expired-csrf-token',
      expiresAt: '2020-01-01T00:00:00.000Z',
    })

    const forged = await SELF.fetch('http://localhost:8787/api/session', {
      headers: { Cookie: officeCookies('forged-token', 'expired-csrf-token') },
    })
    const expired = await SELF.fetch('http://localhost:8787/api/session', {
      headers: { Cookie: officeCookies('expired-session-token', 'expired-csrf-token') },
    })

    expect(forged.status).toBe(401)
    expect(expired.status).toBe(401)
  })

  it('requires double-submit CSRF and exact Origin before logout', async () => {
    await seedSession({
      userId: 'user-a',
      googleSub: 'sub-a',
      email: 'user-a@example.invalid',
      sessionToken: 'session-token-a',
      csrfToken: 'csrf-token-a',
    })

    const missingCsrf = await SELF.fetch('http://localhost:8787/api/logout', {
      method: 'POST',
      headers: { Cookie: officeCookies('session-token-a', 'csrf-token-a') },
    })
    const wrongOrigin = await SELF.fetch('http://localhost:8787/api/logout', {
      method: 'POST',
      headers: {
        Cookie: officeCookies('session-token-a', 'csrf-token-a'),
        Origin: 'https://attacker.example.invalid',
        'X-CSRF-Token': 'csrf-token-a',
      },
    })
    const validLogout = await SELF.fetch('http://localhost:8787/api/logout', {
      method: 'POST',
      headers: {
        Cookie: officeCookies('session-token-a', 'csrf-token-a'),
        Origin: workerEnv.FRONTEND_ORIGIN ?? '',
        'X-CSRF-Token': 'csrf-token-a',
      },
    })
    const afterLogout = await SELF.fetch('http://localhost:8787/api/session', {
      headers: { Cookie: officeCookies('session-token-a', 'csrf-token-a') },
    })

    expect(missingCsrf.status).toBe(403)
    expect(wrongOrigin.status).toBe(403)
    expect(validLogout.status).toBe(204)
    expect(validLogout.headers.get('Set-Cookie')).toContain('Max-Age=0')
    expect(afterLogout.status).toBe(401)
  })

  it('authenticates disabled data routes before returning their Phase B response', async () => {
    await seedSession({
      userId: 'user-a',
      googleSub: 'sub-a',
      email: 'user-a@example.invalid',
      sessionToken: 'session-token-a',
      csrfToken: 'csrf-token-a',
    })

    const unauthenticated = await SELF.fetch('http://localhost:8787/api/history')
    const authenticated = await SELF.fetch('http://localhost:8787/api/history', {
      headers: { Cookie: officeCookies('session-token-a', 'csrf-token-a') },
    })

    expect(unauthenticated.status).toBe(401)
    expect(authenticated.status).toBe(501)
    expect(await authenticated.json<{ error: string }>()).toMatchObject({
      error: 'phase_not_available',
    })
  })
})
