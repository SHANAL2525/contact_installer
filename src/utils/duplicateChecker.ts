import type { ProcessedContact } from '../types/contact'

export function recalculateDuplicates(contacts: ProcessedContact[]): ProcessedContact[] {
  const primaryContactByPhone = new Map<string, string>()

  return contacts.map((contact) => {
    if (!contact.isValid || !contact.normalizedPhone) {
      return { ...contact, status: 'invalid', duplicateOf: null }
    }

    const primaryContactId = primaryContactByPhone.get(contact.normalizedPhone)

    if (primaryContactId) {
      return { ...contact, status: 'duplicate', duplicateOf: primaryContactId }
    }

    primaryContactByPhone.set(contact.normalizedPhone, contact.id)
    return { ...contact, status: 'new', duplicateOf: null }
  })
}
