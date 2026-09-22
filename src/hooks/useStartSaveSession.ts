import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  isGoogleAccountAuthorized,
  type GoogleAccount,
} from '../services/googleAuthService'
import {
  createSaveSession,
  getCurrentSaveSession,
} from '../services/saveSessionService'
import { useContactImport } from './useContactImport'

export function useStartSaveSession() {
  const navigate = useNavigate()
  const { importedFile, revalidateContactsForSave } = useContactImport()
  const startLock = useRef(false)
  const [isStartingSave, setIsStartingSave] = useState(false)
  const [saveStartError, setSaveStartError] = useState('')

  const startSave = useCallback(async (destinationAccount: GoogleAccount) => {
    if (startLock.current) {
      return
    }

    setSaveStartError('')

    if (!isGoogleAccountAuthorized(destinationAccount.id)) {
      setSaveStartError(`Reauthorize ${destinationAccount.email} before saving.`)
      return
    }

    if (!importedFile) {
      setSaveStartError('Import and preview a contact file before saving.')
      return
    }

    startLock.current = true
    setIsStartingSave(true)

    try {
      const currentSession = await getCurrentSaveSession()

      if (
        currentSession
        && currentSession.sourceFileName === importedFile.fileName
        && currentSession.destinationAccountId === destinationAccount.id
        && ['checking', 'saving', 'paused'].includes(currentSession.status)
      ) {
        navigate(`/saving?sessionId=${encodeURIComponent(currentSession.id)}`)
        return
      }

      const refreshedContacts = revalidateContactsForSave()
      const session = await createSaveSession(
        importedFile.fileName,
        refreshedContacts,
        destinationAccount.id,
      )
      navigate(`/saving?sessionId=${encodeURIComponent(session.id)}`)
    } catch (error) {
      startLock.current = false
      setIsStartingSave(false)
      setSaveStartError(
        error instanceof Error ? error.message : 'Unable to start this save. Please try again.',
      )
    }
  }, [importedFile, navigate, revalidateContactsForSave])

  return {
    isStartingSave,
    saveStartError,
    startSave,
  }
}
