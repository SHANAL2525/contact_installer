import { googleAuthorizedFetch } from './googleAuthService'

const CREATE_CONTACT_URL =
  'https://people.googleapis.com/v1/people:createContact?personFields=names,phoneNumbers'

const TEST_CONTACTS = [
  {
    id: 'test-001',
    name: 'Contact Auto Save Test 001',
    phone: '+94771111111',
  },
  {
    id: 'test-002',
    name: 'Contact Auto Save Test 002',
    phone: '+94712222222',
  },
  {
    id: 'test-003',
    name: 'Contact Auto Save Test 003',
    phone: '+94753333333',
  },
] as const

export interface TestContactOperationResult {
  successfulCount: number
  failedCount: number
  totalCount: number
}

type ProgressCallback = (completed: number, total: number) => void

const createdResourceNames = new Map<string, string>()
let isOperationInProgress = false

export type GoogleContactInput = {
  displayName: string
  phone: string
}

export class GoogleContactsRequestError extends Error {
  status: number
  retryable: boolean

  constructor(message: string, status: number, retryable: boolean) {
    super(message)
    this.name = 'GoogleContactsRequestError'
    this.status = status
    this.retryable = retryable
  }
}

function isValidContactResourceName(value: unknown): value is string {
  return typeof value === 'string' && /^people\/[^/?#:\s]+$/.test(value)
}

function getRequestError(response: Response): GoogleContactsRequestError {
  if (response.status === 429) {
    return new GoogleContactsRequestError(
      'Google Contacts rate limit reached. Please try again shortly.',
      response.status,
      true,
    )
  }

  if (response.status >= 500) {
    return new GoogleContactsRequestError(
      'Google Contacts is temporarily unavailable.',
      response.status,
      true,
    )
  }

  if (response.status === 403) {
    return new GoogleContactsRequestError(
      'Google Contacts permission or quota blocked this contact.',
      response.status,
      false,
    )
  }

  return new GoogleContactsRequestError(
    'Google rejected this contact. Check its name and phone number.',
    response.status,
    false,
  )
}

export async function createGoogleContact(
  contact: GoogleContactInput,
): Promise<string> {
  const response = await googleAuthorizedFetch(CREATE_CONTACT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      names: [{ unstructuredName: contact.displayName }],
      phoneNumbers: [{ value: contact.phone, type: 'mobile' }],
    }),
  })

  if (!response.ok) {
    throw getRequestError(response)
  }

  const person: unknown = await response.json()
  const resourceName =
    typeof person === 'object' && person !== null && 'resourceName' in person
      ? person.resourceName
      : undefined

  if (!isValidContactResourceName(resourceName)) {
    throw new Error('Google did not return a valid contact reference.')
  }

  return resourceName
}

export function getCreatedTestContactCount(): number {
  return createdResourceNames.size
}

export async function createTestContacts(
  onProgress: ProgressCallback,
): Promise<TestContactOperationResult> {
  if (isOperationInProgress) {
    throw new Error('A test contact operation is already running.')
  }

  isOperationInProgress = true
  let failedCount = 0

  try {
    for (const [index, contact] of TEST_CONTACTS.entries()) {
      if (!createdResourceNames.has(contact.id)) {
        try {
          const resourceName = await createGoogleContact({
            displayName: contact.name,
            phone: contact.phone,
          })
          createdResourceNames.set(contact.id, resourceName)
        } catch {
          failedCount += 1
        }
      }

      onProgress(index + 1, TEST_CONTACTS.length)
    }

    return {
      successfulCount: createdResourceNames.size,
      failedCount,
      totalCount: TEST_CONTACTS.length,
    }
  } finally {
    isOperationInProgress = false
  }
}

export async function deleteCreatedTestContacts(
  onProgress: ProgressCallback,
): Promise<TestContactOperationResult> {
  if (isOperationInProgress) {
    throw new Error('A test contact operation is already running.')
  }

  isOperationInProgress = true
  const contactsToDelete = Array.from(createdResourceNames.entries())
  let successfulCount = 0

  try {
    for (const [index, [testContactId, resourceName]] of contactsToDelete.entries()) {
      try {
        const response = await googleAuthorizedFetch(
          `https://people.googleapis.com/v1/${resourceName}:deleteContact`,
          { method: 'DELETE' },
        )

        if (response.ok || response.status === 404) {
          createdResourceNames.delete(testContactId)
          successfulCount += 1
        }
      } catch {
        // Keep the resourceName so a failed deletion can be retried safely.
      }

      onProgress(index + 1, contactsToDelete.length)
    }

    return {
      successfulCount,
      failedCount: createdResourceNames.size,
      totalCount: contactsToDelete.length,
    }
  } finally {
    isOperationInProgress = false
  }
}
