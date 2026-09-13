import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getCurrentImport, setImportColumns } from '../services/excelService'

export function ImportPage() {
  const navigate = useNavigate()
  const importedFile = getCurrentImport()
  const [nameColumnIndex, setNameColumnIndex] = useState(importedFile?.nameColumn?.index.toString() ?? '')
  const [phoneColumnIndex, setPhoneColumnIndex] = useState(importedFile?.phoneColumn?.index.toString() ?? '')
  const [mappingError, setMappingError] = useState('')

  if (!importedFile) {
    return (
      <section className="screen">
        <div className="page-intro compact">
          <p className="eyebrow">Import contacts</p>
          <h1>Choose a file first</h1>
          <p className="lede">Start from Home and choose an Excel or CSV file to import.</p>
        </div>
        <div className="page-actions">
          <Link className="button primary" to="/">Return home</Link>
        </div>
      </section>
    )
  }

  const automaticDetectionComplete = Boolean(importedFile.nameColumn && importedFile.phoneColumn)

  function handleContinue() {
    const selectedNameIndex = Number(nameColumnIndex)
    const selectedPhoneIndex = Number(phoneColumnIndex)

    if (nameColumnIndex === '' || phoneColumnIndex === '') {
      setMappingError('Select both the name and phone-number columns.')
      return
    }

    if (selectedNameIndex === selectedPhoneIndex) {
      setMappingError('Name and phone number must use different columns.')
      return
    }

    setImportColumns(selectedNameIndex, selectedPhoneIndex)
    navigate('/preview')
  }

  return (
    <section className="screen">
      <div className="page-intro compact">
        <p className="eyebrow">Import contacts</p>
        <h1>File ready</h1>
        <p className="lede">Check the file details and detected columns before continuing.</p>
      </div>

      <div className="import-summary">
        <div className="file-details">
          <span className="file-icon" aria-hidden="true">XL</span>
          <div>
            <strong>{importedFile.fileName}</strong>
            <span>{importedFile.rows.length} rows found</span>
          </div>
        </div>

        {automaticDetectionComplete ? (
          <dl className="detected-columns">
            <div><dt>Name column</dt><dd>{importedFile.nameColumn?.heading}</dd></div>
            <div><dt>Phone column</dt><dd>{importedFile.phoneColumn?.heading}</dd></div>
          </dl>
        ) : (
          <div className="column-mapping">
            <p>We could not detect both columns automatically. Choose them below.</p>
            <label>
              Name Column
              <select value={nameColumnIndex} onChange={(event) => setNameColumnIndex(event.target.value)}>
                <option value="">Select a column</option>
                {importedFile.columns.map((column) => (
                  <option key={column.index} value={column.index}>{column.heading}</option>
                ))}
              </select>
            </label>
            <label>
              Phone Number Column
              <select value={phoneColumnIndex} onChange={(event) => setPhoneColumnIndex(event.target.value)}>
                <option value="">Select a column</option>
                {importedFile.columns.map((column) => (
                  <option key={column.index} value={column.index}>{column.heading}</option>
                ))}
              </select>
            </label>
            {mappingError && <p className="mapping-error" role="alert">{mappingError}</p>}
          </div>
        )}
      </div>

      <div className="page-actions">
        <Link className="button secondary" to="/">Back home</Link>
        <button className="button primary" type="button" onClick={handleContinue}>Continue</button>
      </div>
    </section>
  )
}
