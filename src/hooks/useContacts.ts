import { useState } from 'react'
import { getContacts, saveContact } from '../services/contactService'
import type { Contact } from '../types/contact'

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>(getContacts)

  function addContact(contact: Contact) {
    saveContact(contact)
    setContacts(getContacts())
  }

  return { contacts, addContact }
}
