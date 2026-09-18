import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { ContactImportProvider } from './components/ContactImportProvider'
import { ContactListPage } from './pages/ContactListPage'
import { FailedContactsPage } from './pages/FailedContactsPage'
import { HistoryPage } from './pages/HistoryPage'
import { HomePage } from './pages/HomePage'
import { ImportPage } from './pages/ImportPage'
import { ManualContactPage } from './pages/ManualContactPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PreviewPage } from './pages/PreviewPage'
import { SaveProgressPage } from './pages/SaveProgressPage'
import { SuccessPage } from './pages/SuccessPage'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <ContactImportProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/preview" element={<PreviewPage />} />
            <Route path="/contacts" element={<ContactListPage />} />
            <Route path="/manual" element={<ManualContactPage />} />
            <Route path="/saving" element={<SaveProgressPage />} />
            <Route path="/success" element={<SuccessPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/failed" element={<FailedContactsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </ContactImportProvider>
    </BrowserRouter>
  )
}

export default App
