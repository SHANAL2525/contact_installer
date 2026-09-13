import { useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getExcelImportErrorMessage, parseSpreadsheetFile } from '../services/excelService'

export function HomePage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isReadingFile, setIsReadingFile] = useState(false)
  const [importError, setImportError] = useState('')

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    setImportError('')
    setIsReadingFile(true)

    try {
      await parseSpreadsheetFile(file)
      navigate('/import')
    } catch (error) {
      setImportError(getExcelImportErrorMessage(error))
    } finally {
      setIsReadingFile(false)
      event.target.value = ''
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
