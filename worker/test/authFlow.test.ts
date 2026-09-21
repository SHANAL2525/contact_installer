import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env, RequestContext } from '../src/env'
import { handleAuthRoute, type AuthRouteDependencies } from '../src/routes/auth'
import { sha256Base64Url } from '../src/security/crypto'
import { clearDatabase, seedPendingInvitation } from './officeTestData'

const now = new Date('2026-01-01T00:00:00.000Z')
const workerEnv = env as unknown as Env

function context(request: Request): RequestContext {
  return {
    request,
    env: workerEnv,
    executionContext: {} as ExecutionContext,
  }
}

function getCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  return headers.getSetCookie?.() ?? [response.headers.get('Set-Cookie') ?? '']
}

function cookiePair(setCookie: string): string {
  return setCookie.split(';', 1)[0]
}

async function startLogin(returnTo = '/history') {
  const dependencies = createDependencies()
  const response = await handleAuthRoute(context(new Request(
    `http://localhost:8787/api/auth/google/start?return_to=${encodeURIComponent(returnTo)}`,
  )), dependencies)
  const authorizationUrl = new URL(response.headers.get('Location') ?? '')
  const transactionCookie = getCookies(response).find((cookie) => cookie.startsWith('cas_oauth_tx='))

  if (!transactionCookie) {
    throw new Error('OAuth transaction cookie was not created.')
  }

  return { dependencies, response, authorizationUrl, transactionCookie: cookiePair(transactionCookie) }
}

function createDependencies(overrides: Partial<AuthRouteDependencies> = {}): AuthRouteDependencies {
  return {
    now: () => now,
    exchanger: {
      exchange: vi.fn(async () => ({ idToken: 'synthetic-id-token' })),
    },
    identityVerifier: {
      verifyIdToken: vi.fn(async () => ({
        sub: 'verified-app-user-sub',
        email: 'verified-user@example.invalid',
        emailVerified: true as const,
        displayName: 'Verified User',
      })),
    },
    ...overrides,
  }
}

async function completeLogin(start: Awaited<ReturnType<typeof startLogin>>) {
  const state = start.authorizationUrl.searchParams.get('state')
  const callback = new Request(
    `http://localhost:8787/api/auth/google/callback?code=synthetic-code&state=${encodeURIComponent(state ?? '')}`,
    { headers: { Cookie: start.transactionCookie } },
  )
  return handleAuthRoute(context(callback), start.dependencies)
}

beforeEach(async () => {
  await clearDatabase()
  await seedPendingInvitation({
    id: 'owner-invitation',
    email: 'verified-user@example.invalid',
    role: 'owner',
  })
})

describe('Google application login flow', () => {
  it('claims an approved owner invitation and stores only a session-token hash', async () => {
    const start = await startLogin()

    expect(start.response.status).toBe(302)
    expect(start.authorizationUrl.origin).toBe('https://accounts.google.com')
    expect(start.authorizationUrl.searchParams.get('scope')).toBe('openid email profile')
    expect(start.authorizationUrl.searchParams.get('code_challenge_method')).toBe('S256')
    expect(start.authorizationUrl.searchParams.get('code_challenge')).toBeTruthy()
    const transaction = await env.DB.prepare(
      'SELECT code_verifier FROM oauth_login_transactions LIMIT 1',
    ).first<{ code_verifier: string }>()
    expect(start.authorizationUrl.searchParams.get('code_challenge'))
      .toBe(await sha256Base64Url(transaction?.code_verifier ?? ''))

    const callbackResponse = await completeLogin(start)
    expect(callbackResponse.status).toBe(302)
    expect(callbackResponse.headers.get('Location')).toBe('http://localhost:5173/history')
    const cookies = getCookies(callbackResponse)
    const sessionCookie = cookies.find((cookie) => cookie.startsWith('cas_session=')) ?? ''
    const rawSessionToken = decodeURIComponent(cookiePair(sessionCookie).slice('cas_session='.length))
    const storedSession = await env.DB.prepare(
      'SELECT session_token_hash FROM app_sessions LIMIT 1',
    ).first<{ session_token_hash: string }>()

    expect(sessionCookie).toContain('HttpOnly')
    expect(sessionCookie).toContain('SameSite=Lax')
    expect(sessionCookie).not.toContain('Secure')
    expect(storedSession?.session_token_hash).toBe(await sha256Base64Url(rawSessionToken))
    expect(storedSession?.session_token_hash).not.toBe(rawSessionToken)
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>())
      .toEqual({ count: 1 })
    expect(await env.DB.prepare(`
      SELECT status, role, google_sub FROM office_access WHERE id = 'owner-invitation'
    `).first()).toMatchObject({
      status: 'active',
      role: 'owner',
      google_sub: 'verified-app-user-sub',
    })
  })

  it('maps a returning Google sub to the existing user record', async () => {
    await completeLogin(await startLogin('/'))
    const initial = await env.DB.prepare('SELECT id FROM users LIMIT 1').first<{ id: string }>()
    const returning = await startLogin('/')
    returning.dependencies.identityVerifier = {
      verifyIdToken: async () => ({
        sub: 'verified-app-user-sub',
        email: 'updated-email@example.invalid',
        emailVerified: true as const,
        displayName: 'Updated User',
      }),
    }
    await completeLogin(returning)
    const users = await env.DB.prepare('SELECT id, primary_email FROM users').all<{
      id: string; primary_email: string
    }>()

    expect(users.results).toEqual([{
      id: initial?.id,
      primary_email: 'updated-email@example.invalid',
    }])
  })

  it('claims an approved staff invitation using the exact verified email', async () => {
    await seedPendingInvitation({
      id: 'staff-invitation',
      email: 'staff.member@example.invalid',
      role: 'staff',
    })
    const start = await startLogin('/')
    start.dependencies.identityVerifier = {
      verifyIdToken: vi.fn(async () => ({
        sub: 'verified-staff-sub',
        email: 'STAFF.MEMBER@example.invalid',
        emailVerified: true as const,
        displayName: 'Staff Member',
      })),
    }
    const response = await completeLogin(start)
    const access = await env.DB.prepare(`
      SELECT status, role, google_sub FROM office_access WHERE id = 'staff-invitation'
    `).first()

    expect(response.status).toBe(302)
    expect(access).toMatchObject({
      status: 'active',
      role: 'staff',
      google_sub: 'verified-staff-sub',
    })
  })

  it('rejects mismatched OAuth state and consumes the transaction once', async () => {
    const start = await startLogin()
    const response = await handleAuthRoute(context(new Request(
      'http://localhost:8787/api/auth/google/callback?code=synthetic-code&state=forged-state',
      { headers: { Cookie: start.transactionCookie } },
    )), start.dependencies)

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toContain('error=authentication_failed')
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM app_sessions').first<{ count: number }>())
      .toEqual({ count: 0 })
    expect(await env.DB.prepare(
      'SELECT code_verifier, consumed_at FROM oauth_login_transactions LIMIT 1',
    ).first()).toMatchObject({ code_verifier: null, consumed_at: now.toISOString() })

    const correctState = start.authorizationUrl.searchParams.get('state')
    await handleAuthRoute(context(new Request(
      `http://localhost:8787/api/auth/google/callback?code=retry&state=${encodeURIComponent(correctState ?? '')}`,
      { headers: { Cookie: start.transactionCookie } },
    )), start.dependencies)
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM app_sessions').first<{ count: number }>())
      .toEqual({ count: 0 })
  })

  it('does not create a session after PKCE exchange or identity verification failure', async () => {
    const pkceFailure = await startLogin()
    pkceFailure.dependencies.exchanger = {
      exchange: vi.fn(async () => { throw new Error('synthetic PKCE failure') }),
    }
    expect((await completeLogin(pkceFailure)).headers.get('Location'))
      .toContain('error=authentication_failed')

    const identityFailure = await startLogin()
    identityFailure.dependencies.identityVerifier = {
      verifyIdToken: vi.fn(async () => { throw new Error('synthetic invalid token') }),
    }
    expect((await completeLogin(identityFailure)).headers.get('Location'))
      .toContain('error=authentication_failed')
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM app_sessions').first<{ count: number }>())
      .toEqual({ count: 0 })
  })

  it('denies an unknown Google account without creating a user or session', async () => {
    const start = await startLogin()
    start.dependencies.identityVerifier = {
      verifyIdToken: vi.fn(async () => ({
        sub: 'unknown-google-sub',
        email: 'unknown@example.invalid',
        emailVerified: true as const,
        displayName: 'Unknown User',
      })),
    }

    const response = await completeLogin(start)

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toContain('error=access_denied')
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>())
      .toEqual({ count: 0 })
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM app_sessions').first<{ count: number }>())
      .toEqual({ count: 0 })
  })

  it('denies a previously revoked Google identity', async () => {
    await completeLogin(await startLogin('/'))
    await env.DB.prepare(`
      UPDATE office_access
      SET status = 'revoked', revoked_at = ?, updated_at = ?
      WHERE id = 'owner-invitation'
    `).bind(now.toISOString(), now.toISOString()).run()
    const returning = await startLogin('/')
    const response = await completeLogin(returning)

    expect(response.headers.get('Location')).toContain('error=access_denied')
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM app_sessions').first<{ count: number }>())
      .toEqual({ count: 1 })
  })
})
