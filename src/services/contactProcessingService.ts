import type {
  ContactEdit,
  ContactSummary,
  ImportedContactRow,
  ProcessedContact,
} from '../types/contact'
import { validateContactPhone } from '../utils/contactValidator'
import { recalculateDuplicates } from '../utils/duplicateChecker'
import { normalizePhoneNumber } from '../utils/phoneNormalizer'

function createDisplayName(name: string, phone: string): string {
  const trimmedName = name.trim()

  if (trimmedName) {
    return trimmedName
  }

  return `Unknown - ${phone.trim() || 'No phone'}`
}

function createProcessedContact(row: ImportedContactRow, index: number): ProcessedContact {
  const originalName = row.name.trim()
  const originalPhone = row.phone.trim()
  const normalizedPhone = normalizePhoneNumber(originalPhone)
  const validation = validateContactPhone(originalPhone, normalizedPhone)

  return {
    id: `import-${row.sourceRowNumber}-${index + 1}`,
    name: createDisplayName(originalName, originalPhone),
    originalName,
    originalNameWasEmpty: originalName === '',
    phone: originalPhone,
    originalPhone,
    normalizedPhone,
    status: validation.isValid ? 'new' : 'invalid',
    isValid: validation.isValid,
    validationMessage: validation.message,
    duplicateOf: null,
    rowNumber: row.sourceRowNumber,
    saveDisplayName: null,
  }
}

export function assignSaveDisplayNames(contacts: ProcessedContact[]): ProcessedContact[] {
  const eligibleCount = contacts.filter((contact) => contact.status === 'new').length
  const numberWidth = Math.max(3, String(Math.max(eligibleCount, 1)).length)
  let sequence = 0

  return contacts.map((contact) => {
    if (contact.status !== 'new') {
      return { ...contact, saveDisplayName: null }
    }

    sequence += 1
    return {
      ...contact,
      saveDisplayName: `${String(sequence).padStart(numberWidth, '0')} ${contact.name}`,
    }
  })
}

export function revalidateProcessedContacts(
  contacts: ProcessedContact[],
): ProcessedContact[] {
  const refreshedContacts = contacts.map((contact) => {
    const phone = contact.phone.trim()
    const normalizedPhone = normalizePhoneNumber(phone)
    const validation = validateContactPhone(phone, normalizedPhone)

    return {
      ...contact,
      name: createDisplayName(contact.name, phone),
      phone,
      normalizedPhone,
      isValid: validation.isValid,
      validationMessage: validation.message,
      status: validation.isValid ? 'new' : 'invalid',
      duplicateOf: null,
      saveDisplayName: null,
    } satisfies ProcessedContact
  })

  return assignSaveDisplayNames(recalculateDuplicates(refreshedContacts))
}

export function processImportedContacts(rows: ImportedContactRow[]): ProcessedContact[] {
  return assignSaveDisplayNames(recalculateDuplicates(rows.map(createProcessedContact)))
}

export function updateProcessedContact(
  contacts: ProcessedContact[],
  contactId: string,
  edit: ContactEdit,
): ProcessedContact[] {
  const updatedContacts = contacts.map((contact) => {
    if (contact.id !== contactId) {
      return contact
    }

    const phone = edit.phone.trim()
    const normalizedPhone = normalizePhoneNumber(phone)
    const validation = validateContactPhone(phone, normalizedPhone)

    return {
      ...contact,
      name: createDisplayName(edit.name, phone),
      phone,
      normalizedPhone,
      isValid: validation.isValid,
      validationMessage: validation.message,
      status: validation.isValid ? 'new' : 'invalid',
      duplicateOf: null,
      saveDisplayName: null,
    } satisfies ProcessedContact
  })

  return assignSaveDisplayNames(recalculateDuplicates(updatedContacts))
}

export function removeProcessedContact(
  contacts: ProcessedContact[],
  contactId: string,
): ProcessedContact[] {
  return assignSaveDisplayNames(
    recalculateDuplicates(contacts.filter((contact) => contact.id !== contactId)),
  )
}

export function summarizeContacts(contacts: ProcessedContact[]): ContactSummary {
  return contacts.reduce<ContactSummary>((summary, contact) => {
    summary.total += 1

    if (contact.status === 'new') {
      summary.newCount += 1
    } else if (contact.status === 'duplicate') {
      summary.duplicateCount += 1
    } else {
      summary.invalidCount += 1
    }

    return summary
  }, { total: 0, newCount: 0, duplicateCount: 0, invalidCount: 0 })
}
