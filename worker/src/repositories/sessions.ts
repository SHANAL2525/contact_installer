export interface SessionWithUserRecord {
  session_id: string
  user_id: string
  google_sub: string
  primary_email: string
  display_name: string | null
  csrf_secret_hash: string
  expires_at: string
  revoked_at: string | null
  office_access_id: string
  office_role: 'owner' | 'staff'
}

export interface CreateSessionInput {
  id: string
  userId: string
  sessionTokenHash: string
  csrfSecretHash: string
  createdAt: string
  expiresAt: string
}

export async function createApplicationSession(
  db: D1Database,
  input: CreateSessionInput,
): Promise<void> {
  await db.prepare(`
    INSERT INTO app_sessions (
      id, user_id, session_token_hash, csrf_secret_hash,
      created_at, expires_at, last_seen_at, revoked_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
  `).bind(
    input.id,
    input.userId,
    input.sessionTokenHash,
    input.csrfSecretHash,
    input.createdAt,
    input.expiresAt,
    input.createdAt,
  ).run()
}

export function findActiveSessionByTokenHash(
  db: D1Database,
  sessionTokenHash: string,
  now: string,
): Promise<SessionWithUserRecord | null> {
  return db.prepare(`
    SELECT
      sessions.id AS session_id,
      sessions.user_id,
      users.google_sub,
      users.primary_email,
      users.display_name,
      sessions.csrf_secret_hash,
      sessions.expires_at,
      sessions.revoked_at,
      access.id AS office_access_id,
      access.role AS office_role
    FROM app_sessions AS sessions
    INNER JOIN users ON users.id = sessions.user_id
    INNER JOIN office_access AS access
      ON access.user_id = users.id
      AND access.google_sub = users.google_sub
    WHERE sessions.session_token_hash = ?
      AND sessions.revoked_at IS NULL
      AND sessions.expires_at > ?
      AND users.status = 'active'
      AND access.status = 'active'
    LIMIT 1
  `).bind(sessionTokenHash, now).first<SessionWithUserRecord>()
}

export async function touchApplicationSession(
  db: D1Database,
  sessionId: string,
  now: string,
): Promise<void> {
  await db.prepare(`
    UPDATE app_sessions
    SET last_seen_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `).bind(now, sessionId).run()
}

export async function updateSessionCsrfHash(
  db: D1Database,
  sessionId: string,
  csrfSecretHash: string,
): Promise<void> {
  await db.prepare(`
    UPDATE app_sessions
    SET csrf_secret_hash = ?
    WHERE id = ? AND revoked_at IS NULL
  `).bind(csrfSecretHash, sessionId).run()
}

export async function revokeApplicationSession(
  db: D1Database,
  sessionId: string,
  revokedAt: string,
): Promise<void> {
  await db.prepare(`
    UPDATE app_sessions
    SET revoked_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `).bind(revokedAt, sessionId).run()
}
