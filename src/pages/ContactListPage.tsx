import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useContactImport } from '../hooks/useContactImport'
import { useStartSaveSession } from '../hooks/useStartSaveSession'
import type { ProcessedContact, ProcessedContactStatus } from '../types/contact'

type ContactFilter = 'all' | ProcessedContactStatus

const filters: Array<{ label: string; value: ContactFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'New', value: 'new' },
  { label: 'Duplicates', value: 'duplicate' },
  { label: 'Invalid', value: 'invalid' },
]

const statusLabels: Record<ProcessedContactStatus, string> = {
  new: 'New',
  duplicate: 'Duplicate',
  invalid: 'Invalid',
}

export function ContactListPage() {
  const { contacts, summary, updateContact, removeContact } = useContactImport()
  const [activeFilter, setActiveFilter] = useState<ContactFilter>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editedName, setEditedName] = useState('')
  const [editedPhone, setEditedPhone] = useState('')
  const { isStartingSave, saveStartError, startSave } = useStartSaveSession()

  const filteredContacts = useMemo(() => (
    activeFilter === 'all'
      ? contacts
      : contacts.filter((contact) => contact.status === activeFilter)
  ), [activeFilter, contacts])

  function startEditing(contact: ProcessedContact) {
    setEditingId(contact.id)
    setEditedName(contact.name)
    setEditedPhone(contact.phone)
  }

  function cancelEditing() {
    setEditingId(null)
    setEditedName('')
    setEditedPhone('')
  }

  function saveEdit(contactId: string) {
    updateContact(contactId, { name: editedName, phone: editedPhone })
    cancelEditing()
  }

  if (contacts.length === 0) {
    return (
      <section className="screen">
        <div className="page-intro compact">
          <p className="eyebrow">Imported contacts</p>
          <h1>Contact list</h1>
          <p className="lede">Import and process a contact file to view contacts here.</p>
        </div>
        <div className="empty-state small">
          <h2>No contacts available</h2>
          <p>Your processed contacts will appear here.</p>
          <Link className="button primary" to="/">Choose a file</Link>
        </div>
      </section>
    )
  }

  return (
    <section className="screen contact-list-screen">
      <div className="page-intro compact">
        <p className="eyebrow">Imported contacts</p>
        <h1>Contact list</h1>
        <p className="lede">Edit or remove contacts before continuing. Changes apply only to this import.</p>
      </div>

      <div className="contact-list-summary">
        <span>{summary.total} contacts</span>
        <Link to="/preview">View summary</Link>
      </div>

      <div className="filter-row" aria-label="Filter contacts">
        {filters.map((filter) => (
          <button
            className={`filter-chip ${activeFilter === filter.value ? 'active' : ''}`}
            type="button"
            key={filter.value}
            aria-pressed={activeFilter === filter.value}
            onClick={() => setActiveFilter(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {filteredContacts.length === 0 ? (
        <div className="empty-state small">
          <h2>No contacts in this filter</h2>
          <p>Choose another status to continue reviewing.</p>
        </div>
      ) : (
        <div className="processed-contact-list">
          {filteredContacts.map((contact) => (
            <article className="processed-contact-card" key={contact.id}>
              {editingId === contact.id ? (
                <div className="edit-contact-form">
                  <label>
                    Name
                    <input value={editedName} onChange={(event) => setEditedName(event.target.value)} />
                  </label>
                  <label>
                    Phone Number
                    <input type="tel" value={editedPhone} onChange={(event) => setEditedPhone(event.target.value)} />
                  </label>
                  <div className="inline-actions">
                    <button className="small-button secondary" type="button" onClick={cancelEditing}>Cancel</button>
                    <button className="small-button primary" type="button" onClick={() => saveEdit(contact.id)}>Save changes</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="contact-card-heading">
                    <div>
                      <span className="row-number">Row {contact.rowNumber}</span>
                      <h2>{contact.name}</h2>
                    </div>
                    <span className={`contact-status status-${contact.status}`}>
                      {statusLabels[contact.status]}
                    </span>
                  </div>

                  <dl className="contact-phone-details">
                    <div><dt>Original Phone</dt><dd>{contact.originalPhone || 'Empty'}</dd></div>
                    <div><dt>Normalized Phone</dt><dd>{contact.normalizedPhone || 'Not available'}</dd></div>
                    {contact.saveDisplayName && (
                      <div><dt>Google Contact Name</dt><dd>{contact.saveDisplayName}</dd></div>
                    )}
                  </dl>

                  {contact.validationMessage && <p className="validation-note">{contact.validationMessage}</p>}
                  {contact.originalNameWasEmpty && <p className="fallback-note">The original name was empty.</p>}

                  <div className="contact-card-actions">
                    <button className="text-action" type="button" onClick={() => startEditing(contact)}>Edit</button>
                    <button className="text-action danger" type="button" onClick={() => removeContact(contact.id)}>
                      Remove from Import
                    </button>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      )}

      {saveStartError && (
        <div className="save-connection-warning" role="alert">
          <p>{saveStartError}</p>
          <Link className="button secondary" to="/">Connect Google Contacts</Link>
        </div>
      )}

      <div className="page-actions">
        <Link className="button secondary" to="/preview">Back to summary</Link>
        <button
          className="button primary"
          type="button"
          disabled={isStartingSave}
          onClick={startSave}
        >
          {isStartingSave ? 'Preparing save…' : 'Continue to Save'}
        </button>
      </div>
    </section>
  )
}
