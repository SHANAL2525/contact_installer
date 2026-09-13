import { Link } from 'react-router-dom'

export function ManualContactPage() {
  return (
    <section className="screen">
      <div className="page-intro compact">
        <p className="eyebrow">Manual entry</p>
        <h1>Add contact manually</h1>
        <p className="lede">Enter one contact at a time. Saving will be connected in a later step.</p>
      </div>

      <form className="contact-form">
        <label>
          Full name
          <input name="name" type="text" placeholder="Enter full name" autoComplete="name" />
        </label>
        <label>
          Phone number
          <input name="phone" type="tel" placeholder="Enter phone number" autoComplete="tel" />
        </label>
        <label>
          Email address
          <input name="email" type="email" placeholder="Enter email address" autoComplete="email" />
        </label>
      </form>

      <div className="page-actions">
        <Link className="button secondary" to="/">Cancel</Link>
        <Link className="button primary" to="/contacts">Add to contact list</Link>
      </div>
    </section>
  )
}
