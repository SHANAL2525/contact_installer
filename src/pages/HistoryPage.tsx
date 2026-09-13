import { Link } from 'react-router-dom'

export function HistoryPage() {
  return (
    <section className="screen">
      <div className="page-intro compact">
        <p className="eyebrow">Activity</p>
        <h1>Import history</h1>
        <p className="lede">Previous contact imports and save results will appear here.</p>
      </div>

      <div className="empty-state">
        <span className="empty-icon" aria-hidden="true">↺</span>
        <h2>No import history</h2>
        <p>Complete your first import to create a history record.</p>
        <Link className="button primary" to="/import">Import a file</Link>
      </div>
    </section>
  )
}
