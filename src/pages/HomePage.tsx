import { useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useContactImport } from '../hooks/useContactImport'
import { getExcelImportErrorMessage, parseSpreadsheetFile } from '../services/excelService'
import {
  connectGoogleContacts,
  disconnectGoogleContacts,
  isGoogleContactsConnected,
} from '../services/googleAuthService'
import {
  createTestContacts,
  deleteCreatedTestContacts,
  getCreatedTestContactCount,
} from '../services/googleContactsService'

type TestContactOperation = 'idle' | 'creating' | 'deleting'

interface TestContactProgress {
  completed: number
  total: number
}

export function HomePage() {
  const navigate = useNavigate()
  const { loadImportedFile } = useContactImport()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isReadingFile, setIsReadingFile] = useState(false)
  const [importError, setImportError] = useState('')
  const [isGoogleConnected, setIsGoogleConnected] = useState(isGoogleContactsConnected)
  const [isGoogleAuthPending, setIsGoogleAuthPending] = useState(false)
  const [googleAuthError, setGoogleAuthError] = useState('')
  const [testContactCount, setTestContactCount] = useState(getCreatedTestContactCount)
  const [testContactOperation, setTestContactOperation] =
    useState<TestContactOperation>('idle')
  const [testContactProgress, setTestContactProgress] = useState<TestContactProgress>({
    completed: 0,
    total: 3,
  })
  const [testContactNotice, setTestContactNotice] = useState('')
  const [testContactError, setTestContactError] = useState('')

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    setImportError('')
    setIsReadingFile(true)

    try {
      const importedFile = await parseSpreadsheetFile(file)
      loadImportedFile(importedFile)
      navigate('/import')
    } catch (error) {
      setImportError(getExcelImportErrorMessage(error))
    } finally {
      setIsReadingFile(false)
      event.target.value = ''
    }
  }

  async function handleGoogleConnection() {
    setGoogleAuthError('')
    setIsGoogleAuthPending(true)

    try {
      if (isGoogleConnected) {
        await disconnectGoogleContacts()
        setIsGoogleConnected(false)
      } else {
        await connectGoogleContacts()
        setIsGoogleConnected(true)
      }
    } catch (error) {
      setIsGoogleConnected(isGoogleContactsConnected())
      setGoogleAuthError(
        error instanceof Error
          ? error.message
          : 'Unable to connect to Google Contacts. Please try again.',
      )
    } finally {
      setIsGoogleAuthPending(false)
    }
  }

  async function handleCreateTestContacts() {
    setTestContactOperation('creating')
    setTestContactProgress({ completed: 0, total: 3 })
    setTestContactNotice('')
    setTestContactError('')

    try {
      const result = await createTestContacts((completed, total) => {
        setTestContactProgress({ completed, total })
      })

      setTestContactCount(getCreatedTestContactCount())

      if (result.successfulCount === result.totalCount) {
        setTestContactNotice('✓ 3 test contacts created successfully')
      } else if (result.successfulCount > 0) {
        setTestContactError(
          `${result.successfulCount} of 3 test contacts were created. Retry to create only the missing contacts, or remove the contacts already created.`,
        )
      } else {
        setTestContactError(
          'No test contacts were created. Check that the People API is enabled and try again.',
        )
      }
    } catch (error) {
      setTestContactError(
        error instanceof Error
          ? error.message
          : 'Unable to create the test contacts. Please try again.',
      )
    } finally {
      setIsGoogleConnected(isGoogleContactsConnected())
      setTestContactCount(getCreatedTestContactCount())
      setTestContactOperation('idle')
    }
  }

  async function handleDeleteTestContacts() {
    const confirmed = window.confirm(
      'Delete only the test contacts created during this test?',
    )

    if (!confirmed) {
      return
    }

    setTestContactOperation('deleting')
    setTestContactProgress({ completed: 0, total: testContactCount })
    setTestContactNotice('')
    setTestContactError('')

    try {
      const result = await deleteCreatedTestContacts((completed, total) => {
        setTestContactProgress({ completed, total })
      })

      const remainingCount = getCreatedTestContactCount()
      setTestContactCount(remainingCount)

      if (remainingCount === 0) {
        setTestContactNotice('✓ Test contacts removed successfully')
      } else {
        setTestContactError(
          `${result.successfulCount} test contacts were removed, but ${remainingCount} could not be removed. Retry to delete only the remaining test contacts.`,
        )
      }
    } catch (error) {
      setTestContactError(
        error instanceof Error
          ? error.message
          : 'Unable to remove the test contacts. Please try again.',
      )
    } finally {
      setIsGoogleConnected(isGoogleContactsConnected())
      setTestContactCount(getCreatedTestContactCount())
      setTestContactOperation('idle')
    }
  }

  return (
    <section className="screen home-screen">
      <div className="page-intro">
        <h1>CONTACT AUTO SAVE</h1>
        <p className="lede">Import an Excel or CSV file and save contacts to your phone.</p>
      </div>

      <div className="home-actions" aria-label="Contact actions">
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          onChange={handleFileChange}
        />
        <button
          className="button primary"
          type="button"
          disabled={isReadingFile}
          onClick={() => fileInputRef.current?.click()}
        >
          {isReadingFile ? 'Reading file…' : 'Upload Excel / CSV'}
        </button>
        <Link className="button secondary" to="/manual">Add Contact Manually</Link>
        <Link className="button secondary" to="/history">History</Link>
      </div>

      {importError && <p className="import-error" role="alert">{importError}</p>}

      <section className="section-card google-contacts-card" aria-labelledby="google-contacts-heading">
        <div className="google-contacts-heading">
          <div>
            <p className="eyebrow">Account connection</p>
            <h2 id="google-contacts-heading">Google Contacts</h2>
          </div>
          <p
            className={`google-connection-status${isGoogleConnected ? ' connected' : ''}`}
            aria-live="polite"
          >
            {isGoogleConnected ? 'Connected ✓' : 'Not connected'}
          </p>
        </div>

        <button
          className="button secondary google-connect-button"
          type="button"
          disabled={isGoogleAuthPending || testContactOperation !== 'idle'}
          onClick={handleGoogleConnection}
        >
          {isGoogleAuthPending
            ? 'Please wait…'
            : isGoogleConnected
              ? 'Disconnect'
              : 'Connect Gmail'}
        </button>

        {googleAuthError && (
          <p className="google-auth-error" role="alert">{googleAuthError}</p>
        )}
      </section>

      {isGoogleConnected && (
        <section className="section-card test-contacts-card" aria-labelledby="test-contacts-heading">
          <div>
            <p className="eyebrow">Google People API</p>
            <h2 id="test-contacts-heading">TEST CONTACTS</h2>
          </div>

          {testContactOperation !== 'idle' && (
            <div className="test-contact-progress" role="status" aria-live="polite">
              <span>
                {testContactOperation === 'creating' ? 'Creating contacts...' : 'Deleting...'}
              </span>
              <strong>
                {testContactProgress.completed} / {testContactProgress.total}
              </strong>
            </div>
          )}

          {testContactNotice && (
            <p className="test-contact-notice" role="status">{testContactNotice}</p>
          )}

          {testContactError && (
            <p className="google-auth-error" role="alert">{testContactError}</p>
          )}

          <div className="test-contact-actions">
            {testContactCount < 3 && (
              <button
                className="button secondary"
                type="button"
                disabled={testContactOperation !== 'idle'}
                onClick={handleCreateTestContacts}
              >
                {testContactCount > 0
                  ? 'Create Missing Test Contacts'
                  : 'Create 3 Test Contacts'}
              </button>
            )}

            {testContactCount > 0 && (
              <button
                className="button test-delete-button"
                type="button"
                disabled={testContactOperation !== 'idle'}
                onClick={handleDeleteTestContacts}
              >
                Delete Test Contacts
              </button>
            )}
          </div>
        </section>
      )}

      <section className="section-card" aria-labelledby="last-import-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Recent activity</p>
            <h2 id="last-import-heading">Last Import</h2>
          </div>
          <span className="status-badge">No activity</span>
        </div>
        <p className="empty-copy">Your latest contact import will appear here.</p>
      </section>
    </section>
  )
}
