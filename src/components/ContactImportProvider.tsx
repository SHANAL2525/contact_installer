import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { ContactImportContext } from '../hooks/contactImportContext'
import {
  processImportedContacts,
  revalidateProcessedContacts,
  removeProcessedContact,
  summarizeContacts,
  updateProcessedContact,
} from '../services/contactProcessingService'
import { getImportedContactRows, setImportColumns } from '../services/excelService'
import type { ContactEdit, ParsedSpreadsheet, ProcessedContact } from '../types/contact'

type ContactImportProviderProps = {
  children: ReactNode
}

const processingErrorMessage = 'Unable to process this contact list. Please check the file and try again.'

export function ContactImportProvider({ children }: ContactImportProviderProps) {
  const [importedFile, setImportedFile] = useState<ParsedSpreadsheet | null>(null)
  const [contacts, setContacts] = useState<ProcessedContact[]>([])
  const [processingError, setProcessingError] = useState('')

  const loadImportedFile = useCallback((file: ParsedSpreadsheet) => {
    setImportedFile(file)
    setContacts([])
    setProcessingError('')
  }, [])

  const preparePreview = useCallback((nameColumnIndex: number, phoneColumnIndex: number) => {
    if (!importedFile) {
      setProcessingError(processingErrorMessage)
      return false
    }

    try {
      const mappedFile = setImportColumns(importedFile, nameColumnIndex, phoneColumnIndex)
      const importedRows = getImportedContactRows(mappedFile)
      const processedContacts = processImportedContacts(importedRows)

      setImportedFile(mappedFile)
      setContacts(processedContacts)
      setProcessingError('')
      return true
    } catch {
      setContacts([])
      setProcessingError(processingErrorMessage)
      return false
    }
  }, [importedFile])

  const updateContact = useCallback((contactId: string, edit: ContactEdit) => {
    setContacts((currentContacts) => updateProcessedContact(currentContacts, contactId, edit))
  }, [])

  const removeContact = useCallback((contactId: string) => {
    setContacts((currentContacts) => removeProcessedContact(currentContacts, contactId))
  }, [])

  const revalidateContactsForSave = useCallback(() => {
    const refreshedContacts = revalidateProcessedContacts(contacts)
    setContacts(refreshedContacts)
    return refreshedContacts
  }, [contacts])

  const summary = useMemo(() => summarizeContacts(contacts), [contacts])

  const value = useMemo(() => ({
    importedFile,
    contacts,
    summary,
    processingError,
    loadImportedFile,
    preparePreview,
    updateContact,
    removeContact,
    revalidateContactsForSave,
  }), [
    importedFile,
    contacts,
    summary,
    processingError,
    loadImportedFile,
    preparePreview,
    updateContact,
    removeContact,
    revalidateContactsForSave,
  ])

  return <ContactImportContext.Provider value={value}>{children}</ContactImportContext.Provider>
}
