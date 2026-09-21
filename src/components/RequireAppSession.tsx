import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAppAuth } from '../hooks/useAppAuth'

export function RequireAppSession() {
  const { session, loading } = useAppAuth()
  const location = useLocation()

  if (loading) {
    return (
      <main className="auth-screen" aria-live="polite">
        <p>Checking your secure session…</p>
      </main>
    )
  }

  if (!session) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to={`/login?return_to=${encodeURIComponent(returnTo)}`} replace />
  }

  return <Outlet />
}
