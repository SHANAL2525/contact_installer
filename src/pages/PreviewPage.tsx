import { Link } from 'react-router-dom'
import { useContactImport } from '../hooks/useContactImport'
import { useStartSaveSession } from '../hooks/useStartSaveSession'

const summaryItems = [
  { label: 'Total Contacts', key: 'total' },
  { label: 'New Contacts', key: 'newCount' },
  { label: 'Duplicates', key: 'duplicateCount' },
  { label: 'Invalid Contacts', key: 'invalidCount' },
] as const

export function PreviewPage() {
  const { importedFile, contacts, summary, processingError } = useContactImport()
  const { isStartingSave, saveStartError, startSave } = useStartSaveSession()
  const eligibleContacts = contacts.filter((contact) => contact.status === 'new')
  const previewContacts = eligibleContacts.slice(0, 5)

  if (processingError) {
    return (
      <section className="screen">
        <div className="page-intro compact">
          <p className="eyebrow">Preview contacts</p>
          <h1>Processing failed</h1>
          <p className="lede">{processingError}</p>
        </div>
        <div className="page-actions">
          <Link className="button primary" to="/import">Return to import</Link>
        </div>
      </section>
    )
  }

  if (!importedFile || contacts.length === 0) {
    return (
      <section className="screen">
        <div className="page-intro compact">
          <p className="eyebrow">Preview contacts</p>
          <h1>No contacts processed</h1>
          <p className="lede">Import a file and continue after selecting the name and phone columns.</p>
        </div>
        <div className="page-actions">
          <Link className="button primary" to={importedFile ? '/import' : '/'}>
            {importedFile ? 'Return to import' : 'Choose a file'}
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="screen">
      <div className="page-intro compact">
        <p className="eyebrow">Contact preview</p>
        <h1>Review import</h1>
        <p className="lede">Contacts from {importedFile.fileName} have been cleaned, validated and checked for duplicates.</p>
      </div>

      <div className="summary-grid" aria-label="Import summary">
        {summaryItems.map((item) => (
          <article className={`summary-card summary-${item.key}`} key={item.key}>
            <span>{item.label}</span>
            <strong>{summary[item.key]}</strong>
          </article>
        ))}
      </div>

      {previewContacts.length > 0 && (
        <section className="save-name-preview" aria-labelledby="save-name-preview-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Google Contact names</p>
              <h2 id="save-name-preview-heading">Ready to save</h2>
            </div>
            <span className="status-badge">{eligibleContacts.length} new</span>
          </div>

          <div className="save-name-list">
            {previewContacts.map((contact) => (
              <div className="save-name-row" key={contact.id}>
                <strong>{contact.saveDisplayName}</strong>
                <span>{contact.normalizedPhone}</span>
              </div>
            ))}
          </div>

          {eligibleContacts.length > previewContacts.length && (
            <p className="save-name-more">
              + {eligibleContacts.length - previewContacts.length} more contacts
            </p>
          )}
        </section>
      )}

      {saveStartError && (
        <div className="save-connection-warning" role="alert">
          <p>{saveStartError}</p>
          <Link className="button secondary" to="/">Connect Google Contacts</Link>
        </div>
      )}

      <div className="page-actions preview-actions">
        <Link className="button secondary" to="/contacts">View All Contacts</Link>
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
