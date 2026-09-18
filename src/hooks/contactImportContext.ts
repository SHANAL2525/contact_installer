import { createContext } from 'react'
import type {
  ContactEdit,
  ContactSummary,
  ParsedSpreadsheet,
  ProcessedContact,
} from '../types/contact'

export type ContactImportContextValue = {
  importedFile: ParsedSpreadsheet | null
  contacts: ProcessedContact[]
  summary: ContactSummary
  processingError: string
  loadImportedFile: (file: ParsedSpreadsheet) => void
  preparePreview: (nameColumnIndex: number, phoneColumnIndex: number) => boolean
  updateContact: (contactId: string, edit: ContactEdit) => void
  removeContact: (contactId: string) => void
  revalidateContactsForSave: () => ProcessedContact[]
}

export const ContactImportContext = createContext<ContactImportContextValue | undefined>(undefined)
