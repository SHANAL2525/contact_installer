// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'

const authMocks = vi.hoisted(() => ({
  session: null as null | {
    user: { displayName: string | null; email: string; role: 'owner' | 'staff' }
    csrfToken: string
  },
  fetchSession: vi.fn(async () => null as null | {
    user: { displayName: string | null; email: string; role: 'owner' | 'staff' }
    csrfToken: string
  }),
  logout: vi.fn(async () => undefined),
}))

vi.mock('../src/config/appMode', () => ({
  isOfficeMode: () => false,
}))

vi.mock('../src/services/appAuthService', () => ({
  fetchAppSession: () => authMocks.fetchSession(),
  getAppLoginUrl: (returnPath = '/') => `/api/auth/google/start?return_to=${encodeURIComponent(returnPath)}`,
  logoutAppSession: authMocks.logout,
}))

describe('application authentication gate', () => {
  afterEach(cleanup)

  beforeEach(() => {
    localStorage.clear()
    authMocks.session = null
    authMocks.fetchSession.mockImplementation(async () => authMocks.session)
    authMocks.fetchSession.mockClear()
    authMocks.logout.mockClear()
    window.history.replaceState({}, '', '/history')
  })

  it('redirects an unauthenticated visitor to the public login page', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Sign in securely' })).toBeTruthy()
    expect(authMocks.fetchSession).toHaveBeenCalledTimes(1)
    const loginLink = screen.getByRole('link', { name: 'Continue with Google' })
    expect(loginLink.getAttribute('href')).toContain('/api/auth/google/start')
    expect(loginLink.getAttribute('href')).toContain('%2Fhistory')
  })

  it('shows the verified application identity and safely logs out', async () => {
    authMocks.session = {
      user: {
        displayName: 'Synthetic User',
        email: 'synthetic@example.invalid',
        role: 'staff',
      },
      csrfToken: 'synthetic-csrf-token',
    }
    window.history.replaceState({}, '', '/')
    render(<App />)

    expect(await screen.findByText('Synthetic User')).toBeTruthy()
    expect(screen.getByText('synthetic@example.invalid')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(authMocks.logout).toHaveBeenCalledWith('synthetic-csrf-token'))
    expect(await screen.findByRole('heading', { name: 'Sign in securely' })).toBeTruthy()
  })

  it('shows office-user management only to owners', async () => {
    authMocks.session = {
      user: {
        displayName: 'Synthetic Owner',
        email: 'owner@example.invalid',
        role: 'owner',
      },
      csrfToken: 'synthetic-csrf-token',
    }
    window.history.replaceState({}, '', '/')
    const { unmount } = render(<App />)

    expect(await screen.findByRole('link', { name: 'Office Users' })).toBeTruthy()
    unmount()

    authMocks.session = {
      user: {
        displayName: 'Synthetic Staff',
        email: 'staff@example.invalid',
        role: 'staff',
      },
      csrfToken: 'synthetic-csrf-token',
    }
    render(<App />)

    await screen.findByText('Synthetic Staff')
    expect(screen.queryByRole('link', { name: 'Office Users' })).toBeNull()
  })
})
