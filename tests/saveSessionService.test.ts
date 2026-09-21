import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { processImportedContacts } from '../src/services/contactProcessingService'

const testState = vi.hoisted(() => ({
  authorized: true,
  existingNumbers: new Map<string, string | null>(),
  listAccountIds: [] as string[],
  createCalls: [] as Array<{
    accountId: string
    contact: { displayName: string; phone: string }
  }>,
  createFailure: null as Error | null,
}))

vi.mock('../src/services/googleAuthService', () => {
  class GoogleAuthorizationError extends Error {
    code: 'not_connected' | 'expired'

    constructor(code: 'not_connected' | 'expired', message: string) {
      super(message)
      this.name = 'GoogleAuthorizationError'
      this.code = code
    }
  }

  return {
    getGoogleAccount: (accountId: string) => accountId === 'google-sub-a'
      ? {
          id: 'google-sub-a',
          email: 'alice@gmail.com',
          addedAt: '2026-01-01T00:00:00.000Z',
          lastAuthorizedAt: '2026-01-01T00:00:00.000Z',
          status: 'connected',
        }
      : null,
    isGoogleAccountAuthorized: () => testState.authorized,
    GoogleAuthorizationError,
  }
})

vi.mock('../src/services/googleContactsService', () => {
  class GoogleContactsRequestError extends Error {
    status: number
    retryable: boolean

    constructor(message: string, status: number, retryable: boolean) {
      super(message)
      this.name = 'GoogleContactsRequestError'
      this.status = status
      this.retryable = retryable
    }
  }

  return {
    GoogleContactsRequestError,
    listExistingGooglePhoneNumbers: async (accountId: string) => {
      testState.listAccountIds.push(accountId)
      return new Map(testState.existingNumbers)
    },
    createGoogleContact: async (
      accountId: string,
      contact: { displayName: string; phone: string },
    ) => {
      testState.createCalls.push({ accountId, contact })

      if (testState.createFailure) {
        throw testState.createFailure
      }

      return `people/mock-${testState.createCalls.length}`
    },
  }
})

async function deleteTestDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('contact-auto-save')
    request.addEventListener('success', () => resolve())
    request.addEventListener('error', () => reject(request.error))
    request.addEventListener('blocked', () => reject(new Error('Test database deletion was blocked.')))
  })
}

function createContacts() {
  return processImportedContacts([
    { sourceRowNumber: 2, name: 'Alice', phone: '0771234567' },
    { sourceRowNumber: 3, name: 'Bob', phone: '0712345678' },
    { sourceRowNumber: 4, name: 'Duplicate', phone: '+94 77 123 4567' },
    { sourceRowNumber: 5, name: 'Invalid', phone: 'ABC' },
  ])
}

describe('account-specific save sessions', () => {
  beforeAll(async () => {
    await deleteTestDatabase()
  })

  beforeEach(() => {
    localStorage.clear()
    testState.authorized = true
    testState.existingNumbers.clear()
    testState.listAccountIds.length = 0
    testState.createCalls.length = 0
    testState.createFailure = null
  })

  it('persists a session against the verified destination account', async () => {
    const service = await import('../src/services/saveSessionService')
    const created = await service.createSaveSession(
      'contacts.csv',
      createContacts(),
      'google-sub-a',
    )
    const reloaded = await service.getSaveSession(created.id)
    const current = await service.getCurrentSaveSession()
    const history = await service.listSaveSessions()

    expect(reloaded).toMatchObject({
      schemaVersion: 2,
      destinationAccountId: 'google-sub-a',
      destinationEmail: 'alice@gmail.com',
      totalNewContacts: 2,
      sourceSkippedCount: 2,
    })
    expect(reloaded?.items.map((item) => item.saveDisplayName)).toEqual([
      '001 Alice',
      '002 Bob',
    ])
    expect(current?.id).toBe(created.id)
    expect(history.some((session) => session.id === created.id)).toBe(true)
  })

  it('checks existing contacts first and creates only valid new contacts sequentially', async () => {
    const service = await import('../src/services/saveSessionService')
    testState.existingNumbers.set('+94771234567', 'people/existing-alice')
    const created = await service.createSaveSession(
      'duplicates.csv',
      createContacts(),
      'google-sub-a',
    )

    const completed = await service.runSaveQueue(created.id)

    expect(testState.listAccountIds).toEqual(['google-sub-a'])
    expect(testState.createCalls).toEqual([{
      accountId: 'google-sub-a',
      contact: { displayName: '002 Bob', phone: '+94712345678' },
    }])
    expect(completed.status).toBe('completed')
    expect(completed.successCount).toBe(1)
    expect(completed.items[0]).toMatchObject({
      status: 'skipped',
      skipReason: 'existing_google_contact',
    })
    expect(completed.items[1]).toMatchObject({
      status: 'saved',
      resourceName: 'people/mock-1',
      attempts: 1,
    })
  })

  it('pauses without Google API calls and resumes only for the same account', async () => {
    const service = await import('../src/services/saveSessionService')
    const created = await service.createSaveSession(
      'resume.csv',
      createContacts(),
      'google-sub-a',
    )

    testState.authorized = false
    const paused = await service.runSaveQueue(created.id)

    expect(paused.status).toBe('paused')
    expect(paused.destinationAccountId).toBe('google-sub-a')
    expect(testState.listAccountIds).toEqual([])
    expect(testState.createCalls).toEqual([])

    testState.authorized = true
    const resumed = await service.runSaveQueue(created.id)

    expect(resumed.status).toBe('completed')
    expect(testState.listAccountIds).toEqual(['google-sub-a'])
    expect(testState.createCalls.every((call) => call.accountId === 'google-sub-a')).toBe(true)
  })

  it('does not automatically retry an ambiguous contact-creation failure', async () => {
    const service = await import('../src/services/saveSessionService')
    const oneContact = processImportedContacts([
      { sourceRowNumber: 2, name: 'Alice', phone: '0771234567' },
    ])
    const created = await service.createSaveSession(
      'ambiguous.csv',
      oneContact,
      'google-sub-a',
    )
    testState.createFailure = new TypeError('Network response was lost')

    const failed = await service.runSaveQueue(created.id)
    const secondRun = await service.runSaveQueue(created.id)

    expect(failed.status).toBe('failed')
    expect(failed.items[0]).toMatchObject({ status: 'failed', attempts: 1 })
    expect(failed.items[0].error).toContain('uncertain')
    expect(secondRun.items[0].attempts).toBe(1)
    expect(testState.createCalls).toHaveLength(1)
  })
})
