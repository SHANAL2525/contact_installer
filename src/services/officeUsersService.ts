export type OfficeUserRole = 'owner' | 'staff'
export type OfficeUserStatus = 'pending' | 'active' | 'revoked'

export interface OfficeUser {
  id: string
  email: string
  displayName: string | null
  role: OfficeUserRole
  status: OfficeUserStatus
  invitedAt: string
  activatedAt: string | null
  revokedAt: string | null
  isCurrentUser: boolean
}
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '')

export async function listOfficeUsers(): Promise<OfficeUser[]> {
  const response = await fetch(`${apiBaseUrl}/api/office-users`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Unable to load office users.'))
  }

  if (!isOfficeUsersPayload(payload)) {
    throw new Error('The office-user response was invalid.')
  }

  return payload.users
}

export async function inviteOfficeUser(email: string, csrfToken: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/office-users/invitations`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ email }),
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Unable to invite this Google account.'))
  }
}

export async function revokeOfficeUser(accessId: string, csrfToken: string): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/api/office-users/${encodeURIComponent(accessId)}/revoke`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': csrfToken },
    },
  )
  const payload = response.status === 204 ? null : await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Unable to revoke this office user.'))
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (
    payload
    && typeof payload === 'object'
    && 'message' in payload
    && typeof payload.message === 'string'
  ) {
    return payload.message
  }

  return fallback
}

function isOfficeUsersPayload(payload: unknown): payload is { users: OfficeUser[] } {
  return Boolean(
    payload
    && typeof payload === 'object'
    && 'users' in payload
    && Array.isArray(payload.users)
    && payload.users.every(isOfficeUser),
  )
}

function isOfficeUser(value: unknown): value is OfficeUser {
  if (!value || typeof value !== 'object') {
    return false
  }

  const user = value as Partial<OfficeUser>
  return (
    typeof user.id === 'string'
    && typeof user.email === 'string'
    && (user.displayName === null || typeof user.displayName === 'string')
    && (user.role === 'owner' || user.role === 'staff')
    && (user.status === 'pending' || user.status === 'active' || user.status === 'revoked')
    && typeof user.invitedAt === 'string'
    && (user.activatedAt === null || typeof user.activatedAt === 'string')
    && (user.revokedAt === null || typeof user.revokedAt === 'string')
    && typeof user.isCurrentUser === 'boolean'
  )
}
