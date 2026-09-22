export interface AppUser {
  displayName: string | null
  email: string
  role: 'owner' | 'staff'
}

export interface AppSession {
  user: AppUser
  csrfToken: string
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '')

export function getAppLoginUrl(returnPath = '/'): string {
  const safeReturnPath = returnPath.startsWith('/') && !returnPath.startsWith('//')
    ? returnPath
    : '/'
  return `${apiBaseUrl}/api/auth/google/start?return_to=${encodeURIComponent(safeReturnPath)}`
}

export async function fetchAppSession(): Promise<AppSession | null> {
  const response = await fetch(`${apiBaseUrl}/api/session`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })

  if (response.status === 401) {
    return null
  }

  if (!response.ok) {
    throw new Error('Unable to verify the application session.')
  }

  const payload = await response.json() as {
    authenticated?: unknown
    user?: { displayName?: unknown; email?: unknown; role?: unknown }
    csrfToken?: unknown
  }

  if (
    payload.authenticated !== true
    || typeof payload.user?.email !== 'string'
    || (payload.user.role !== 'owner' && payload.user.role !== 'staff')
    || typeof payload.csrfToken !== 'string'
    || (
      payload.user.displayName !== null
      && typeof payload.user.displayName !== 'string'
    )
  ) {
    throw new Error('The application session response was invalid.')
  }

  return {
    user: {
      displayName: payload.user.displayName ?? null,
      email: payload.user.email,
      role: payload.user.role,
    },
    csrfToken: payload.csrfToken,
  }
}

export async function logoutAppSession(csrfToken: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'X-CSRF-Token': csrfToken,
    },
  })

  if (!response.ok && response.status !== 401) {
    throw new Error('Unable to sign out safely.')
  }
}
