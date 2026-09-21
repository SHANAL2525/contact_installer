import { Navigate, useLocation } from 'react-router-dom'
import { useAppAuth } from '../hooks/useAppAuth'
import { getAppLoginUrl } from '../services/appAuthService'

export function LoginPage() {
  const { session, loading, error } = useAppAuth()
  const location = useLocation()
  const search = new URLSearchParams(location.search)
  const returnPath = search.get('return_to') ?? '/'
  const hasAuthenticationError = search.has('error') || Boolean(error)

  if (!loading && session) {
    return <Navigate to="/" replace />
  }

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="login-title">
        <span className="brand-mark" aria-hidden="true">CA</span>
        <p className="eyebrow">Contact Auto Save</p>
        <h1 id="login-title">Sign in securely</h1>
        <p className="lede">
          Use your Google identity to access your application workspace. Contact access is connected separately.
        </p>
        {hasAuthenticationError && (
          <p className="auth-error" role="alert">
            Sign-in could not be completed. Please try again.
          </p>
        )}
        <a className="button primary auth-button" href={getAppLoginUrl(returnPath)}>
          Continue with Google
        </a>
      </section>
    </main>
  )
}
