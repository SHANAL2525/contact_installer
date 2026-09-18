import { useContext } from 'react'
import { ContactImportContext } from './contactImportContext'

export function useContactImport() {
  const context = useContext(ContactImportContext)

  if (!context) {
    throw new Error('useContactImport must be used inside ContactImportProvider')
  }

  return context
}
