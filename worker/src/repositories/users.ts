export interface UserRecord {
  id: string
  google_sub: string
  primary_email: string
  email_verified: 1
  display_name: string | null
  status: 'active' | 'deletion_pending' | 'deleted'
  created_at: string
  updated_at: string
}

export interface CreateUserInput {
  id: string
  googleSub: string
  primaryEmail: string
  displayName?: string | null
  now: string
}

export async function createUserFromVerifiedIdentity(
  db: D1Database,
  input: CreateUserInput,
): Promise<UserRecord> {
  await db.prepare(`
    INSERT INTO users (
      id, google_sub, primary_email, email_verified, display_name, status, created_at, updated_at
    ) VALUES (?, ?, ?, 1, ?, 'active', ?, ?)
  `).bind(
    input.id,
    input.googleSub,
    input.primaryEmail,
    input.displayName ?? null,
    input.now,
    input.now,
  ).run()

  const user = await findUserById(db, input.id)

  if (!user) {
    throw new Error('Created user could not be loaded.')
  }

  return user
}

export async function upsertUserFromVerifiedIdentity(
  db: D1Database,
  input: CreateUserInput,
): Promise<UserRecord> {
  await db.prepare(`
    INSERT INTO users (
      id, google_sub, primary_email, email_verified, display_name, status, created_at, updated_at
    ) VALUES (?, ?, ?, 1, ?, 'active', ?, ?)
    ON CONFLICT(google_sub) DO UPDATE SET
      primary_email = excluded.primary_email,
      email_verified = 1,
      display_name = excluded.display_name,
      updated_at = excluded.updated_at
  `).bind(
    input.id,
    input.googleSub,
    input.primaryEmail,
    input.displayName ?? null,
    input.now,
    input.now,
  ).run()

  const user = await findUserByGoogleSub(db, input.googleSub)

  if (!user) {
    throw new Error('Authenticated user could not be loaded.')
  }

  return user
}

export function findUserById(db: D1Database, userId: string): Promise<UserRecord | null> {
  return db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1')
    .bind(userId)
    .first<UserRecord>()
}

export function findUserByGoogleSub(
  db: D1Database,
  googleSub: string,
): Promise<UserRecord | null> {
  return db.prepare('SELECT * FROM users WHERE google_sub = ? LIMIT 1')
    .bind(googleSub)
    .first<UserRecord>()
}
