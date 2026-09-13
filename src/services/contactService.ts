import type { Contact } from '../types/contact'

const contacts: Contact[] = []

export function getContacts(): Contact[] {
  return contacts
}

export function saveContact(contact: Contact): Contact {
  contacts.push(contact)
  return contact
}
