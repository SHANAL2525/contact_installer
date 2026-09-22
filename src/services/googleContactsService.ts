import { googleAuthorizedFetch } from './googleAuthService'
import { normalizePhoneNumber } from '../utils/phoneNormalizer'

const CREATE_CONTACT_URL =
  'https://people.googleapis.com/v1/people:createContact?personFields=names,phoneNumbers'
const CONNECTIONS_URL = 'https://people.googleapis.com/v1/people/me/connections'

export type GoogleContactInput = {
  displayName: string
  phone: string
}

interface GooglePhoneNumber {
  value?: unknown
}

interface GoogleConnection {
  resourceName?: unknown
  phoneNumbers?: unknown
}

interface GoogleConnectionsResponse {
  connections?: unknown
  nextPageToken?: unknown
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

function getRequestError(
  response: Response,
  operation: 'check' | 'create',
): GoogleContactsRequestError {
  const action = operation === 'check'
    ? 'check existing Google Contacts'
    : 'create this Google Contact'

  if (response.status === 429) {
    return new GoogleContactsRequestError(
      `Google Contacts rate limit prevented the app from continuing to ${action}.`,
      response.status,
      true,
    )
  }

  if (response.status >= 500) {
    return new GoogleContactsRequestError(
      `Google Contacts is temporarily unavailable and could not ${action}.`,
      response.status,
      true,
    )
  }

  if (response.status === 403) {
    return new GoogleContactsRequestError(
      `Google Contacts permission or quota blocked the app from continuing to ${action}.`,
      response.status,
      false,
    )
  }

  return new GoogleContactsRequestError(
    operation === 'check'
      ? 'Google rejected the existing-contact check. No contacts were created.'
      : 'Google rejected this contact. Check its name and phone number.',
    response.status,
    false,
  )
}

function getConnectionPhoneNumbers(connection: GoogleConnection): string[] {
  if (!Array.isArray(connection.phoneNumbers)) {
    return []
  }

  return connection.phoneNumbers.flatMap((phoneNumber: GooglePhoneNumber) => (
    typeof phoneNumber.value === 'string' ? [phoneNumber.value] : []
  ))
}

export async function listExistingGooglePhoneNumbers(
  accountId: string,
): Promise<Map<string, string | null>> {
  const existingNumbers = new Map<string, string | null>()
  let pageToken: string | null = null

  do {
    const url = new URL(CONNECTIONS_URL)
    url.searchParams.set('personFields', 'phoneNumbers')
    url.searchParams.set('pageSize', '1000')
    url.searchParams.set('sources', 'READ_SOURCE_TYPE_CONTACT')

    if (pageToken) {
      url.searchParams.set('pageToken', pageToken)
    }

    const response = await googleAuthorizedFetch(accountId, url)

    if (!response.ok) {
      throw getRequestError(response, 'check')
    }

    const payload = await response.json() as GoogleConnectionsResponse
    const connections = Array.isArray(payload.connections)
      ? payload.connections as GoogleConnection[]
      : []

    connections.forEach((connection) => {
      const resourceName = isValidContactResourceName(connection.resourceName)
        ? connection.resourceName
        : null

      getConnectionPhoneNumbers(connection).forEach((phoneNumber) => {
        const normalizedPhone = normalizePhoneNumber(phoneNumber)

        if (normalizedPhone && !existingNumbers.has(normalizedPhone)) {
          existingNumbers.set(normalizedPhone, resourceName)
        }
      })
    })

    pageToken = typeof payload.nextPageToken === 'string' && payload.nextPageToken
      ? payload.nextPageToken
      : null
  } while (pageToken)

  return existingNumbers
}

export async function createGoogleContact(
  accountId: string,
  contact: GoogleContactInput,
): Promise<string> {
  const response = await googleAuthorizedFetch(accountId, CREATE_CONTACT_URL, {
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
    throw getRequestError(response, 'create')
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
