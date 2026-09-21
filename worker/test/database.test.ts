import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearDatabase } from './officeTestData'

const now = '2026-01-01T00:00:00.000Z'

async function insertUser(id: string, googleSub: string): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO users (
      id, google_sub, primary_email, email_verified, status, created_at, updated_at
    ) VALUES (?, ?, ?, 1, 'active', ?, ?)
  `).bind(id, googleSub, `${id}@example.invalid`, now, now).run()
}

beforeEach(clearDatabase)

describe('initial D1 migration', () => {
  it('creates all required tables', async () => {
    const result = await env.DB.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
        AND name NOT LIKE '_cf_%'
        AND name != 'd1_migrations'
      ORDER BY name
    `).all<{ name: string }>()

    expect(result.results.map((row) => row.name)).toEqual([
      'app_sessions',
      'google_accounts',
      'import_batches',
      'import_destinations',
      'oauth_login_transactions',
      'office_access',
      'save_events',
      'saved_contacts',
      'users',
    ])
  })

  it('enforces foreign keys and immutable Google sub uniqueness', async () => {
    await insertUser('user-a', 'app-google-sub-a')

    await expect(insertUser('user-b', 'app-google-sub-a')).rejects.toThrow()
    await expect(env.DB.prepare(`
      INSERT INTO google_accounts (
        id, user_id, google_sub, email, email_verified, status,
        connected_at, last_authorized_at, updated_at
      ) VALUES ('account-missing-owner', 'missing-user', 'destination-sub',
        'destination@example.invalid', 1, 'connected', ?, ?, ?)
    `).bind(now, now, now).run()).rejects.toThrow()
  })

  it('rejects duplicate destinations and idempotency keys', async () => {
    await insertUser('user-a', 'app-google-sub-a')
    await env.DB.prepare(`
      INSERT INTO google_accounts (
        id, user_id, google_sub, email, email_verified, status,
        connected_at, last_authorized_at, updated_at
      ) VALUES ('account-a', 'user-a', 'destination-sub-a',
        'destination-a@example.invalid', 1, 'connected', ?, ?, ?)
    `).bind(now, now, now).run()
    await env.DB.prepare(`
      INSERT INTO import_batches (
        id, user_id, source_file_name, source_file_type, status, created_at, updated_at
      ) VALUES ('batch-a', 'user-a', 'synthetic.csv', 'csv', 'prepared', ?, ?)
    `).bind(now, now).run()
    await env.DB.prepare(`
      INSERT INTO import_destinations (
        id, user_id, import_batch_id, google_account_id, status, created_at, updated_at
      ) VALUES ('destination-a', 'user-a', 'batch-a', 'account-a', 'pending', ?, ?)
    `).bind(now, now).run()

    await expect(env.DB.prepare(`
      INSERT INTO import_destinations (
        id, user_id, import_batch_id, google_account_id, status, created_at, updated_at
      ) VALUES ('destination-duplicate', 'user-a', 'batch-a', 'account-a', 'pending', ?, ?)
    `).bind(now, now).run()).rejects.toThrow()

    await env.DB.prepare(`
      INSERT INTO save_events (
        id, user_id, import_batch_id, import_destination_id,
        event_type, outcome, idempotency_key, created_at
      ) VALUES ('event-a', 'user-a', 'batch-a', 'destination-a',
        'save_started', 'accepted', 'idempotency-key-a', ?)
    `).bind(now).run()

    await expect(env.DB.prepare(`
      INSERT INTO save_events (
        id, user_id, import_batch_id, import_destination_id,
        event_type, outcome, idempotency_key, created_at
      ) VALUES ('event-b', 'user-a', 'batch-a', 'destination-a',
        'save_started', 'accepted', 'idempotency-key-a', ?)
    `).bind(now).run()).rejects.toThrow()
  })
})
