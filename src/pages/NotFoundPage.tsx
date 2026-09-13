import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="screen centered-screen">
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p className="lede">The page you requested does not exist.</p>
      <div className="page-actions centered-actions">
        <Link className="button primary" to="/">Return home</Link>
      </div>
    </section>
  )
}
