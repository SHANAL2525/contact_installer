import { describe, expect, it } from 'vitest'
import {
  processImportedContacts,
  removeProcessedContact,
  updateProcessedContact,
} from '../src/services/contactProcessingService'
import { validateContactPhone } from '../src/utils/contactValidator'
import { normalizePhoneNumber } from '../src/utils/phoneNormalizer'

describe('Sri Lankan phone normalization and validation', () => {
  it.each([
    ['077 123 4567', '+94771234567'],
    ['77-123-4567', '+94771234567'],
    ['94 77 123 4567', '+94771234567'],
    ['+94 (77) 123 4567', '+94771234567'],
    ['0094 77 123 4567', '+94771234567'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizePhoneNumber(input)).toBe(expected)
  })

  it.each([
    ['', 'Phone number is empty.'],
    ['077ABC4567', 'Phone number contains letters.'],
    ['123', 'Phone number is too short.'],
    ['1234567890123456', 'Phone number is too long.'],
    ['0000000000', 'Phone number is not usable.'],
  ])('rejects invalid input %s', (input, message) => {
    expect(validateContactPhone(input, normalizePhoneNumber(input))).toEqual({
      isValid: false,
      message,
    })
  })
})

describe('contact processing regression protection', () => {
  const rows = [
    { sourceRowNumber: 2, name: 'Alice', phone: '0771234567' },
    { sourceRowNumber: 3, name: 'Alice duplicate', phone: '+94 77 123 4567' },
    { sourceRowNumber: 4, name: 'Invalid', phone: 'ABC' },
    { sourceRowNumber: 5, name: 'Bob', phone: '0712345678' },
  ]

  it('detects duplicates and numbers only valid new contacts sequentially', () => {
    const contacts = processImportedContacts(rows)

    expect(contacts.map(({ status, saveDisplayName }) => ({ status, saveDisplayName })))
      .toEqual([
        { status: 'new', saveDisplayName: '001 Alice' },
        { status: 'duplicate', saveDisplayName: null },
        { status: 'invalid', saveDisplayName: null },
        { status: 'new', saveDisplayName: '002 Bob' },
      ])
    expect(contacts[1].duplicateOf).toBe(contacts[0].id)
  })

  it('revalidates edits and recalculates duplicate status and numbering', () => {
    const contacts = processImportedContacts(rows)
    const edited = updateProcessedContact(contacts, contacts[1].id, {
      name: 'Carol',
      phone: '0761234567',
    })

    expect(edited[1]).toMatchObject({
      name: 'Carol',
      normalizedPhone: '+94761234567',
      status: 'new',
      saveDisplayName: '002 Carol',
    })
    expect(edited[3].saveDisplayName).toBe('003 Bob')
  })

  it('removes contacts and promotes the next duplicate without gaps', () => {
    const contacts = processImportedContacts(rows)
    const remaining = removeProcessedContact(contacts, contacts[0].id)

    expect(remaining.map((contact) => contact.id)).not.toContain(contacts[0].id)
    expect(remaining[0]).toMatchObject({
      status: 'new',
      duplicateOf: null,
      saveDisplayName: '001 Alice duplicate',
    })
    expect(remaining[2].saveDisplayName).toBe('002 Bob')
  })
})
