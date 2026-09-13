import { Link } from 'react-router-dom'
import { getCurrentImport, getImportedContactRows } from '../services/excelService'

export function PreviewPage() {
  const importedFile = getCurrentImport()
  const importedContacts = getImportedContactRows()

  return (
    <section className="screen">
      <div className="page-intro compact">
        <p className="eyebrow">Step 2 of 4</p>
        <h1>Preview contacts</h1>
        <p className="lede">Imported contact details will be checked here before they are added to your list.</p>
      </div>

      <div className="empty-state">
        <span className="empty-icon" aria-hidden="true">□</span>
        <h2>{importedFile ? `${importedContacts.length} contacts ready` : 'No file selected'}</h2>
        <p>
          {importedFile
            ? `The rows from ${importedFile.fileName} are stored temporarily. The detailed preview is the next development step.`
            : 'Upload an Excel or CSV file from Home to prepare a contact preview.'}
        </p>
      </div>

      <div className="page-actions">
        <Link className="button secondary" to="/import">Back to import</Link>
        <Link className="button primary" to="/contacts">View contact list</Link>
      </div>
    </section>
  )
}
