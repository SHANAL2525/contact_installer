import { Link } from 'react-router-dom'

export function ContactListPage() {
  return (
    <section className="screen">
      <div className="page-intro compact">
        <p className="eyebrow">Step 3 of 4</p>
        <h1>Contact list</h1>
        <p className="lede">Review imported and manually added contacts before saving.</p>
      </div>

      <div className="list-summary">
        <span>Contacts ready</span>
        <strong>0</strong>
      </div>

      <div className="empty-state small">
        <h2>No contacts added</h2>
        <p>Import a file or add a contact manually to begin.</p>
      </div>

      <div className="page-actions stacked">
        <Link className="button secondary" to="/manual">Add contact manually</Link>
        <Link className="button primary" to="/saving">Continue to save</Link>
      </div>
    </section>
  )
}
