import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AppAuthContext } from '../hooks/appAuthContext'
import {
  fetchAppSession,
  logoutAppSession,
  type AppSession,
} from '../services/appAuthService'

export function AppAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AppSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    fetchAppSession()
      .then((nextSession) => {
        if (active) {
          setSession(nextSession)
        }
      })
      .catch(() => {
        if (active) {
          setError('We could not verify your sign-in. Please try again.')
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  const logout = useCallback(async () => {
    if (session) {
      await logoutAppSession(session.csrfToken)
    }
    setSession(null)
  }, [session])

  const value = useMemo(() => ({ session, loading, error, logout }), [error, loading, logout, session])

  return <AppAuthContext.Provider value={value}>{children}</AppAuthContext.Provider>
}
