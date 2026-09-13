import { Link } from 'react-router-dom'

export function SuccessPage() {
  return (
    <section className="screen centered-screen">
      <span className="success-icon" aria-hidden="true">✓</span>
      <p className="eyebrow">Complete</p>
      <h1>Contacts saved</h1>
      <p className="lede">The completed save summary will appear here.</p>

      <div className="success-summary">
        <span>Contacts saved</span>
        <strong>0</strong>
      </div>

      <div className="page-actions centered-actions">
        <Link className="button secondary" to="/history">View history</Link>
        <Link className="button primary" to="/">Back home</Link>
      </div>
    </section>
  )
}
