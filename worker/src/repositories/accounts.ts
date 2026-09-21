export interface GoogleAccountRecord {
  id: string
  user_id: string
  google_sub: string
  email: string
  email_verified: 1
  status: 'connected' | 'reauthorization_required' | 'disconnected'
  connected_at: string
  last_authorized_at: string | null
  disconnected_at: string | null
  updated_at: string
}
export interface CreateGoogleAccountInput {
  id: string
  userId: string
  googleSub: string
  email: string
  now: string
}

export async function createGoogleAccount(
  db: D1Database,
  input: CreateGoogleAccountInput,
): Promise<GoogleAccountRecord> {
  await db.prepare(`
    INSERT INTO google_accounts (
      id, user_id, google_sub, email, email_verified, status,
      connected_at, last_authorized_at, disconnected_at, updated_at
    ) VALUES (?, ?, ?, ?, 1, 'connected', ?, ?, NULL, ?)
  `).bind(
    input.id,
    input.userId,
    input.googleSub,
    input.email,
    input.now,
    input.now,
    input.now,
  ).run()

  const account = await findGoogleAccountForUser(db, input.userId, input.id)

  if (!account) {
    throw new Error('Created Google account could not be loaded.')
  }

  return account
}

export function findGoogleAccountForUser(
  db: D1Database,
  userId: string,
  accountId: string,
): Promise<GoogleAccountRecord | null> {
  return db.prepare(`
    SELECT * FROM google_accounts
    WHERE user_id = ? AND id = ?
    LIMIT 1
  `).bind(userId, accountId).first<GoogleAccountRecord>()
}

export async function listGoogleAccountsForUser(
  db: D1Database,
  userId: string,
): Promise<GoogleAccountRecord[]> {
  const result = await db.prepare(`
    SELECT * FROM google_accounts
    WHERE user_id = ?
    ORDER BY connected_at ASC
  `).bind(userId).all<GoogleAccountRecord>()

  return result.results
}
