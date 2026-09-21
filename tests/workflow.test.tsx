// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'

const officeMocks = vi.hoisted(() => ({
  fetchSession: vi.fn(async () => ({
    user: { displayName: 'Should Not Render', email: 'not-used@example.invalid' },
    csrfToken: 'not-used',
  })),
  startSave: vi.fn(async () => undefined),
}))

vi.mock('../src/config/appMode', () => ({
  isOfficeMode: () => true,
}))

vi.mock('../src/services/appAuthService', () => ({
  fetchAppSession: officeMocks.fetchSession,
  getAppLoginUrl: () => '/api/auth/google/start',
  logoutAppSession: async () => undefined,
}))

vi.mock('../src/hooks/useGoogleAccounts', () => ({
  useGoogleAccounts: () => [{
    id: 'google-sub-a',
    email: 'alice@gmail.com',
    addedAt: '2026-01-01T00:00:00.000Z',
    lastAuthorizedAt: '2026-01-01T00:00:00.000Z',
    status: 'connected',
  }],
}))

vi.mock('../src/hooks/useStartSaveSession', () => ({
  useStartSaveSession: () => ({
    isStartingSave: false,
    saveStartError: '',
    startSave: officeMocks.startSave,
  }),
}))

describe('office import-to-history workflow', () => {
  afterEach(cleanup)

  beforeEach(() => {
    localStorage.clear()
    officeMocks.fetchSession.mockClear()
    officeMocks.startSave.mockClear()
    window.history.replaceState({}, '', '/')
  })

  it('opens Home without a Worker session or fake application identity', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'CONTACT AUTO SAVE' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Manage Google Accounts' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull()
    expect(screen.queryByText('Should Not Render')).toBeNull()
    expect(officeMocks.fetchSession).not.toHaveBeenCalled()
  })

  it('supports direct navigation to a React Router route without a Worker session', async () => {
    window.history.replaceState({}, '', '/history')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Import history' })).toBeTruthy()
    expect(officeMocks.fetchSession).not.toHaveBeenCalled()
  })

  it('keeps upload, preview, sole-account confirmation, save, and history navigation connected', async () => {
    const { container } = render(<App />)
    const fileInput = await waitFor(() => {
      const input = container.querySelector('input[type="file"]')
      expect(input).not.toBeNull()
      return input
    })

    fireEvent.change(fileInput as HTMLInputElement, {
      target: {
        files: [new File([
          'Name,Contact Number\nAlice,0771234567\nBob,0712345678',
        ], 'contacts.csv', { type: 'text/csv' })],
      },
    })

    expect(await screen.findByRole('heading', { name: 'File ready' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('heading', { name: 'Review import' })).toBeTruthy()
    const destination = screen.getByRole('checkbox', { name: /alice@gmail.com/i })
    expect((destination as HTMLInputElement).checked).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Continue to Save' }))
    expect(screen.getByText('alice@gmail.com', { selector: 'li' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & Save Contacts' }))

    await waitFor(() => expect(officeMocks.startSave).toHaveBeenCalledWith(expect.objectContaining({
      id: 'google-sub-a',
      email: 'alice@gmail.com',
    })))

    expect(officeMocks.fetchSession).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('link', { name: 'History' }))
    expect(await screen.findByRole('heading', { name: 'Import history' })).toBeTruthy()
  })
})
