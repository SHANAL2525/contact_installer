import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useContactImport } from '../hooks/useContactImport'
import { useGoogleAccounts } from '../hooks/useGoogleAccounts'
import { useStartSaveSession } from '../hooks/useStartSaveSession'
import {
  getSelectedGoogleAccountIds,
  saveSelectedGoogleAccountIds,
} from '../services/googleAccountSelectionService'

const summaryItems = [
  { label: 'Total Contacts', key: 'total' },
  { label: 'New Contacts', key: 'newCount' },
  { label: 'Duplicates', key: 'duplicateCount' },
  { label: 'Invalid Contacts', key: 'invalidCount' },
] as const

export function PreviewPage() {
  const { importedFile, contacts, summary, processingError } = useContactImport()
  const accounts = useGoogleAccounts()
  const { isStartingSave, saveStartError, startSave } = useStartSaveSession()
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(() => (
    getSelectedGoogleAccountIds(accounts)
  ))
  const [selectionError, setSelectionError] = useState('')
  const [isConfirmingDestinations, setIsConfirmingDestinations] = useState(false)
  const eligibleContacts = contacts.filter((contact) => contact.status === 'new')
  const previewContacts = eligibleContacts.slice(0, 5)
  const connectedAccounts = accounts.filter((account) => account.status === 'connected')
  const selectedAccounts = connectedAccounts.filter((account) => (
    selectedAccountIds.includes(account.id)
  ))
  const maximumPlannedCreations = eligibleContacts.length * selectedAccounts.length

  function toggleAccount(accountId: string) {
    setSelectionError('')
    setIsConfirmingDestinations(false)
    setSelectedAccountIds((currentIds) => {
      const nextIds = currentIds.includes(accountId)
        ? currentIds.filter((currentId) => currentId !== accountId)
        : [...currentIds, accountId]

      return saveSelectedGoogleAccountIds(nextIds)
    })
  }

  function continueToConfirmation() {
    if (selectedAccounts.length === 0) {
      setSelectionError('Select at least one connected Google account.')
      return
    }

    setSelectionError('')
    setIsConfirmingDestinations(true)
  }

  async function handleConfirmedSave() {
    if (selectedAccounts.length !== 1) {
      setSelectionError('Select exactly one account for this single-account saving stage.')
      setIsConfirmingDestinations(false)
      return
    }

    await startSave(selectedAccounts[0])
  }

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

      <section className="destination-selector" aria-labelledby="destination-selector-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Save contacts to</p>
            <h2 id="destination-selector-heading">Choose destinations</h2>
          </div>
          <span className="status-badge">{selectedAccounts.length} selected</span>
        </div>

        {accounts.length === 0 ? (
          <div className="destination-empty">
            <p>Add at least one Google account before choosing destinations.</p>
            <Link className="button secondary" to="/accounts">Add Gmail Account</Link>
          </div>
        ) : (
          <fieldset className="destination-options">
            <legend className="visually-hidden">Connected Google accounts</legend>
            {accounts.map((account) => {
              const isConnected = account.status === 'connected'

              return (
                <label
                  className={`destination-option${isConnected ? '' : ' unavailable'}`}
                  key={account.id}
                >
                  <input
                    type="checkbox"
                    checked={selectedAccountIds.includes(account.id)}
                    disabled={!isConnected}
                    onChange={() => toggleAccount(account.id)}
                  />
                  <span className="destination-check" aria-hidden="true" />
                  <span className="destination-copy">
                    <strong>{account.email}</strong>
                    <small>{isConnected ? 'Connected and verified' : 'Reauthorization required'}</small>
                  </span>
                </label>
              )
            })}
          </fieldset>
        )}

        <dl className="destination-totals">
          <div><dt>Contacts ready</dt><dd>{eligibleContacts.length}</dd></div>
          <div><dt>Selected accounts</dt><dd>{selectedAccounts.length}</dd></div>
          <div><dt>Maximum planned creations</dt><dd>{maximumPlannedCreations}</dd></div>
        </dl>

        {selectionError && <p className="import-error" role="alert">{selectionError}</p>}

        {!isConfirmingDestinations && (
          <button
            className="button primary destination-continue"
            type="button"
            disabled={selectedAccounts.length === 0 || eligibleContacts.length === 0}
            onClick={continueToConfirmation}
          >
            Continue to Save
          </button>
        )}
      </section>

      {isConfirmingDestinations && selectedAccounts.length > 0 && (
        <section className="destination-confirmation" aria-labelledby="destination-confirmation-heading">
          <p className="eyebrow">Confirmation</p>
          <h2 id="destination-confirmation-heading">Confirm destination accounts</h2>
          <p className="confirmation-copy">
            These exact Google accounts are selected for the planned save operation:
          </p>
          <ul className="confirmation-account-list">
            {selectedAccounts.map((account) => (
              <li key={account.id}>{account.email}</li>
            ))}
          </ul>
          <dl className="confirmation-totals">
            <div><dt>Contacts ready</dt><dd>{eligibleContacts.length}</dd></div>
            <div><dt>Maximum planned creations</dt><dd>{maximumPlannedCreations}</dd></div>
          </dl>
          <div className="phase-safety-note" role="note">
            <strong>
              {selectedAccounts.length === 1
                ? 'Ready for account-specific saving'
                : 'Multi-account saving is not enabled yet'}
            </strong>
            <p>
              {selectedAccounts.length === 1
                ? `Existing contacts in ${selectedAccounts[0].email} will be checked before any new contact is created.`
                : 'Select one destination to save now. Multiple-account queues remain disabled until the next approved stage.'}
            </p>
          </div>
          {saveStartError && <p className="import-error" role="alert">{saveStartError}</p>}
          <div className="confirmation-actions">
            <button
              className="button secondary"
              type="button"
              onClick={() => setIsConfirmingDestinations(false)}
            >
              Change Selection
            </button>
            <button
              className="button primary"
              type="button"
              disabled={selectedAccounts.length !== 1 || isStartingSave}
              onClick={handleConfirmedSave}
            >
              {isStartingSave ? 'Preparing Save…' : 'Confirm & Save Contacts'}
            </button>
          </div>
        </section>
      )}

      <div className="page-actions preview-actions">
        <Link className="button secondary" to="/contacts">View All Contacts</Link>
        <Link className="button secondary" to="/accounts">Manage Accounts</Link>
      </div>
    </section>
  )
}
