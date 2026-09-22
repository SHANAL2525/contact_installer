import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AppAuthProvider } from './components/AppAuthProvider'
import { ContactImportProvider } from './components/ContactImportProvider'
import { RequireAppSession } from './components/RequireAppSession'
import { isOfficeMode } from './config/appMode'
import { AccountsPage } from './pages/AccountsPage'
import { ContactListPage } from './pages/ContactListPage'
import { FailedContactsPage } from './pages/FailedContactsPage'
import { HistoryPage } from './pages/HistoryPage'
import { HomePage } from './pages/HomePage'
import { ImportPage } from './pages/ImportPage'
import { ManualContactPage } from './pages/ManualContactPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { OfficeUsersPage } from './pages/OfficeUsersPage'
import { PreviewPage } from './pages/PreviewPage'
import { SaveProgressPage } from './pages/SaveProgressPage'
import { SuccessPage } from './pages/SuccessPage'
import './App.css'

function workspaceRoutes(showApplicationIdentity: boolean) {
  return (
    <Route element={<AppShell showApplicationIdentity={showApplicationIdentity} />}>
      <Route path="/" element={<HomePage />} />
      <Route path="/import" element={<ImportPage />} />
      <Route path="/preview" element={<PreviewPage />} />
      <Route path="/contacts" element={<ContactListPage />} />
      <Route path="/manual" element={<ManualContactPage />} />
      <Route path="/saving" element={<SaveProgressPage />} />
      <Route path="/success" element={<SuccessPage />} />
      <Route path="/history" element={<HistoryPage />} />
      <Route path="/accounts" element={<AccountsPage />} />
      {showApplicationIdentity && <Route path="/office-users" element={<OfficeUsersPage />} />}
      <Route path="/failed" element={<FailedContactsPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>
  )
}

function OfficeApplication() {
  return (
    <ContactImportProvider>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        {workspaceRoutes(false)}
      </Routes>
    </ContactImportProvider>
  )
}

function CloudAuthenticatedApplication() {
  return (
    <AppAuthProvider>
      <ContactImportProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAppSession />}>
            {workspaceRoutes(true)}
          </Route>
        </Routes>
      </ContactImportProvider>
    </AppAuthProvider>
  )
}

function App() {
  return (
    <BrowserRouter>
      {isOfficeMode() ? <OfficeApplication /> : <CloudAuthenticatedApplication />}
    </BrowserRouter>
  )
}

export default App
