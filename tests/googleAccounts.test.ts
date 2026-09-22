import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getSelectedGoogleAccountIds,
  saveSelectedGoogleAccountIds,
} from '../src/services/googleAccountSelectionService'
import type { GoogleAccount } from '../src/services/googleAuthService'

const accountA: GoogleAccount = {
  id: 'google-sub-a',
  email: 'alice@gmail.com',
  addedAt: '2026-01-01T00:00:00.000Z',
  lastAuthorizedAt: '2026-01-01T00:00:00.000Z',
  status: 'connected',
}

const accountB: GoogleAccount = {
  id: 'google-sub-b',
  email: 'bob@gmail.com',
  addedAt: '2026-01-02T00:00:00.000Z',
  lastAuthorizedAt: '2026-01-02T00:00:00.000Z',
  status: 'connected',
}

describe('Google account selection', () => {
  beforeEach(() => localStorage.clear())

  it('automatically selects the sole connected account', () => {
    expect(getSelectedGoogleAccountIds([accountA])).toEqual([accountA.id])
  })

  it('preserves the existing selection when another account is added', () => {
    expect(getSelectedGoogleAccountIds([accountA])).toEqual([accountA.id])
    expect(getSelectedGoogleAccountIds([accountA, accountB])).toEqual([accountA.id])
  })

  it('requires an explicit selection when multiple accounts have no prior selection', () => {
    saveSelectedGoogleAccountIds([])
    expect(getSelectedGoogleAccountIds([accountA, accountB])).toEqual([])
  })
})

describe('Google authorization identity isolation', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id')
    localStorage.clear()
  })

  afterEach(() => {
    delete (window as Window & { google?: unknown }).google
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('binds each verified Google sub to its own in-memory token', async () => {
    const tokens = ['token-for-a', 'token-for-b']
    const identities = new Map([
      ['token-for-a', { sub: accountA.id, email: accountA.email, email_verified: true }],
      ['token-for-b', { sub: accountB.id, email: accountB.email, email_verified: true }],
    ])
    const peopleApiTokens: string[] = []

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get('Authorization') ?? ''
      const token = authorization.replace('Bearer ', '')

      if (String(input).includes('/userinfo')) {
        return new Response(JSON.stringify(identities.get(token)), { status: 200 })
      }

      peopleApiTokens.push(token)
      return new Response('{}', { status: 200 })
    })

    vi.stubGlobal('fetch', fetchMock)
    ;(window as Window & { google?: unknown }).google = {
      accounts: {
        oauth2: {
          initTokenClient: (config: { callback: (response: object) => void }) => ({
            requestAccessToken: () => config.callback({
              access_token: tokens.shift(),
              expires_in: 3600,
            }),
          }),
          hasGrantedAllScopes: () => true,
          revoke: (_token: string, done: () => void) => done(),
        },
      },
    }

    const auth = await import('../src/services/googleAuthService')
    await auth.connectGoogleAccount()
    await auth.connectGoogleAccount()

    expect(auth.getGoogleAccounts().map(({ id, email }) => ({ id, email }))).toEqual([
      { id: accountA.id, email: accountA.email },
      { id: accountB.id, email: accountB.email },
    ])

    await auth.googleAuthorizedFetch(accountA.id, 'https://people.googleapis.com/account-a')
    await auth.googleAuthorizedFetch(accountB.id, 'https://people.googleapis.com/account-b')

    expect(peopleApiTokens).toEqual(['token-for-a', 'token-for-b'])
    expect(Array.from({ length: localStorage.length }, (_, index) => (
      localStorage.getItem(localStorage.key(index) ?? '')
    )).join(' ')).not.toContain('token-for-')
  })
})
