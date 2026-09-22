import { env, SELF } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createGoogleAccount,
  findGoogleAccountForUser,
} from '../src/repositories/accounts'
import {
  createImportBatch,
  createImportDestination,
  createSavedContact,
  createSaveEvent,
  listImportHistoryForUser,
} from '../src/repositories/imports'
import { createUserFromVerifiedIdentity } from '../src/repositories/users'
import { clearDatabase } from './officeTestData'

const now = '2026-01-01T00:00:00.000Z'

async function seedTwoUsers(): Promise<void> {
  await createUserFromVerifiedIdentity(env.DB, {
    id: 'user-a',
    googleSub: 'app-google-sub-a',
    primaryEmail: 'synthetic-user-a@example.invalid',
    now,
  })
  await createUserFromVerifiedIdentity(env.DB, {
    id: 'user-b',
    googleSub: 'app-google-sub-b',
    primaryEmail: 'synthetic-user-b@example.invalid',
    now,
  })
  await createGoogleAccount(env.DB, {
    id: 'account-a',
    userId: 'user-a',
    googleSub: 'destination-google-sub-a',
    email: 'synthetic-destination-a@example.invalid',
    now,
  })
  await createGoogleAccount(env.DB, {
    id: 'account-b',
    userId: 'user-b',
    googleSub: 'destination-google-sub-b',
    email: 'synthetic-destination-b@example.invalid',
    now,
  })
}

beforeEach(async () => {
  await clearDatabase()
  await seedTwoUsers()
})

describe('repository ownership isolation', () => {
  it('scopes account lookups and import history to the authenticated user id', async () => {
    expect(await findGoogleAccountForUser(env.DB, 'user-a', 'account-b')).toBeNull()

    await createImportBatch(env.DB, {
      id: 'batch-a',
      userId: 'user-a',
      sourceFileName: 'synthetic.csv',
      sourceFileType: 'csv',
      sourceRowCount: 2,
      validContactCount: 2,
      duplicateContactCount: 0,
      invalidContactCount: 0,
      now,
    })

    expect(await listImportHistoryForUser(env.DB, 'user-a')).toHaveLength(1)
    expect(await listImportHistoryForUser(env.DB, 'user-b')).toHaveLength(0)
  })

  it('rejects a destination linked to another user account', async () => {
    await createImportBatch(env.DB, {
      id: 'batch-a',
      userId: 'user-a',
      sourceFileName: 'synthetic.csv',
      sourceFileType: 'csv',
      sourceRowCount: 1,
      validContactCount: 1,
      duplicateContactCount: 0,
      invalidContactCount: 0,
      now,
    })

    await expect(createImportDestination(env.DB, {
      id: 'destination-cross-account',
      userId: 'user-a',
      importBatchId: 'batch-a',
      googleAccountId: 'account-b',
      totalContactCount: 1,
      now,
    })).rejects.toThrow()

    await expect(createImportDestination(env.DB, {
      id: 'destination-cross-batch',
      userId: 'user-b',
      importBatchId: 'batch-a',
      googleAccountId: 'account-b',
      totalContactCount: 1,
      now,
    })).rejects.toThrow()
  })

  it('rejects saved contacts and events that cross user boundaries', async () => {
    await createImportBatch(env.DB, {
      id: 'batch-a',
      userId: 'user-a',
      sourceFileName: 'synthetic.csv',
      sourceFileType: 'csv',
      sourceRowCount: 1,
      validContactCount: 1,
      duplicateContactCount: 0,
      invalidContactCount: 0,
      now,
    })
    await createImportDestination(env.DB, {
      id: 'destination-a',
      userId: 'user-a',
      importBatchId: 'batch-a',
      googleAccountId: 'account-a',
      totalContactCount: 1,
      now,
    })

    await expect(createSavedContact(env.DB, {
      id: 'contact-cross-account',
      userId: 'user-a',
      importBatchId: 'batch-a',
      importDestinationId: 'destination-a',
      googleAccountId: 'account-b',
      sourceContactKey: 'synthetic-row-1',
      contactFingerprint: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      status: 'pending',
      now,
    })).rejects.toThrow()

    await createSavedContact(env.DB, {
      id: 'contact-a',
      userId: 'user-a',
      importBatchId: 'batch-a',
      importDestinationId: 'destination-a',
      googleAccountId: 'account-a',
      sourceContactKey: 'synthetic-row-1',
      contactFingerprint: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      status: 'pending',
      now,
    })

    await expect(createSaveEvent(env.DB, {
      id: 'event-cross-user',
      userId: 'user-b',
      importBatchId: 'batch-a',
      importDestinationId: 'destination-a',
      savedContactId: 'contact-a',
      eventType: 'contact_attempted',
      outcome: 'accepted',
      idempotencyKey: 'event-cross-user-key',
      now,
    })).rejects.toThrow()
  })
})

describe('API access isolation', () => {
  it('does not trust a client-supplied user id while authentication is unavailable', async () => {
    const response = await SELF.fetch(
      'https://local.test/api/history?user_id=user-a',
      { headers: { 'X-User-Id': 'user-a' } },
    )
    const body = await response.json<{ error: string }>()

    expect(response.status).toBe(401)
    expect(body.error).toBe('unauthorized')
  })
})
