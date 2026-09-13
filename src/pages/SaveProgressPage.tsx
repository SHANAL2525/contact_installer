import { Link } from 'react-router-dom'

export function SaveProgressPage() {
  return (
    <section className="screen centered-screen">
      <div className="progress-ring" aria-label="Save progress: waiting to start">
        <strong>0%</strong>
      </div>
      <p className="eyebrow">Step 4 of 4</p>
      <h1>Ready to save</h1>
      <p className="lede">Contact saving progress will be shown here when device integration is added.</p>

      <div className="page-actions centered-actions">
        <Link className="button secondary" to="/contacts">Back to contacts</Link>
        <Link className="button primary" to="/success">View completion screen</Link>
      </div>
    </section>
  )
}
