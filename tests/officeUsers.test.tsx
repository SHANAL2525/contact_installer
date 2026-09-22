// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'

const testState = vi.hoisted(() => ({
  list: vi.fn(),
  invite: vi.fn(),
  revoke: vi.fn(),
}))

vi.mock('../src/config/appMode', () => ({
  isOfficeMode: () => false,
}))

vi.mock('../src/services/appAuthService', () => ({
  fetchAppSession: async () => ({
    user: {
      displayName: 'Office Owner',
      email: 'owner@example.invalid',
      role: 'owner',
    },
    csrfToken: 'owner-csrf-token',
  }),
  getAppLoginUrl: () => '/api/auth/google/start',
  logoutAppSession: vi.fn(),
}))

vi.mock('../src/services/officeUsersService', () => ({
  listOfficeUsers: () => testState.list(),
  inviteOfficeUser: (email: string, csrfToken: string) => testState.invite(email, csrfToken),
  revokeOfficeUser: (id: string, csrfToken: string) => testState.revoke(id, csrfToken),
}))

const officeUsers = [
  {
    id: 'owner-access',
    email: 'owner@example.invalid',
    displayName: 'Office Owner',
    role: 'owner',
    status: 'active',
    invitedAt: '2026-01-01T00:00:00.000Z',
    activatedAt: '2026-01-01T00:00:00.000Z',
    revokedAt: null,
    isCurrentUser: true,
  },
  {
    id: 'staff-access',
    email: 'staff@example.invalid',
    displayName: 'Office Staff',
    role: 'staff',
    status: 'active',
    invitedAt: '2026-01-01T00:00:00.000Z',
    activatedAt: '2026-01-01T00:00:00.000Z',
    revokedAt: null,
    isCurrentUser: false,
  },
]

describe('owner office-user management page', () => {
  afterEach(cleanup)

  beforeEach(() => {
    window.history.replaceState({}, '', '/office-users')
    testState.list.mockReset().mockResolvedValue(officeUsers)
    testState.invite.mockReset().mockResolvedValue(undefined)
    testState.revoke.mockReset().mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('lists users and sends owner-authorized invitations', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Office users' })).toBeTruthy()
    expect(await screen.findByText('staff@example.invalid')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Staff Google account'), {
      target: { value: 'new.staff@example.invalid' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add staff' }))

    await waitFor(() => expect(testState.invite).toHaveBeenCalledWith(
      'new.staff@example.invalid',
      'owner-csrf-token',
    ))
  })

  it('asks for confirmation and revokes the selected staff access', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Revoke access' }))

    await waitFor(() => expect(testState.revoke).toHaveBeenCalledWith(
      'staff-access',
      'owner-csrf-token',
    ))
    expect(window.confirm).toHaveBeenCalledWith('Revoke office access for staff@example.invalid?')
  })
})
