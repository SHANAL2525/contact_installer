import { findUserByGoogleSub, upsertUserFromVerifiedIdentity } from './users'

export type OfficeRole = 'owner' | 'staff'
export type OfficeAccessStatus = 'pending' | 'active' | 'revoked'

export interface OfficeAccessRecord {
  id: string
  invited_email: string
  invited_email_normalized: string
  user_id: string | null
  google_sub: string | null
  role: OfficeRole
  status: OfficeAccessStatus
  created_by_user_id: string | null
  revoked_by_user_id: string | null
  invited_at: string
  activated_at: string | null
  revoked_at: string | null
  updated_at: string
}

export interface OfficeAccessListItem extends OfficeAccessRecord {
  primary_email: string | null
  display_name: string | null
}

export interface AuthorizedOfficeIdentity {
  access: OfficeAccessRecord
  user: {
    id: string
    google_sub: string
    primary_email: string
    display_name: string | null
  }
}

export class OfficeAccessConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OfficeAccessConflictError'
  }
}

export function normalizeOfficeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function findOfficeAccessByGoogleSub(
  db: D1Database,
  googleSub: string,
): Promise<OfficeAccessRecord | null> {
  return db.prepare(`
    SELECT * FROM office_access
    WHERE google_sub = ?
    LIMIT 1
  `).bind(googleSub).first<OfficeAccessRecord>()
}

export function findPendingOfficeInvitationByEmail(
  db: D1Database,
  email: string,
): Promise<OfficeAccessRecord | null> {
  return db.prepare(`
    SELECT * FROM office_access
    WHERE invited_email_normalized = ?
      AND status = 'pending'
      AND user_id IS NULL
      AND google_sub IS NULL
    LIMIT 1
  `).bind(normalizeOfficeEmail(email)).first<OfficeAccessRecord>()
}

export async function authorizeVerifiedOfficeIdentity(
  db: D1Database,
  input: {
    userId: string
    googleSub: string
    email: string
    displayName: string | null
    now: string
  },
): Promise<AuthorizedOfficeIdentity | null> {
  const boundAccess = await findOfficeAccessByGoogleSub(db, input.googleSub)

  if (boundAccess) {
    if (boundAccess.status !== 'active' || !boundAccess.user_id) {
      return null
    }

    const user = await upsertUserFromVerifiedIdentity(db, {
      id: boundAccess.user_id,
      googleSub: input.googleSub,
      primaryEmail: input.email,
      displayName: input.displayName,
      now: input.now,
    })

    return user.status === 'active'
      ? { access: boundAccess, user }
      : null
  }

  const invitation = await findPendingOfficeInvitationByEmail(db, input.email)

  if (!invitation) {
    return null
  }

  const existingUser = await findUserByGoogleSub(db, input.googleSub)
  const userId = existingUser?.id ?? input.userId

  const results = await db.batch([
    db.prepare(`
      INSERT INTO users (
        id, google_sub, primary_email, email_verified, display_name, status, created_at, updated_at
      ) VALUES (?, ?, ?, 1, ?, 'active', ?, ?)
      ON CONFLICT(google_sub) DO UPDATE SET
        primary_email = excluded.primary_email,
        email_verified = 1,
        display_name = excluded.display_name,
        updated_at = excluded.updated_at
    `).bind(
      userId,
      input.googleSub,
      input.email,
      input.displayName,
      input.now,
      input.now,
    ),
    db.prepare(`
      UPDATE office_access
      SET user_id = ?,
          google_sub = ?,
          status = 'active',
          activated_at = ?,
          updated_at = ?
      WHERE id = ?
        AND invited_email_normalized = ?
        AND status = 'pending'
        AND user_id IS NULL
        AND google_sub IS NULL
    `).bind(
      userId,
      input.googleSub,
      input.now,
      input.now,
      invitation.id,
      normalizeOfficeEmail(input.email),
    ),
  ])

  if ((results[1].meta.changes ?? 0) !== 1) {
    return null
  }

  const access = await findOfficeAccessByGoogleSub(db, input.googleSub)
  const user = await findUserByGoogleSub(db, input.googleSub)

  if (!access || access.status !== 'active' || !user || user.status !== 'active') {
    return null
  }

  return { access, user }
}

export async function listOfficeAccess(db: D1Database): Promise<OfficeAccessListItem[]> {
  const result = await db.prepare(`
    SELECT
      access.*,
      users.primary_email,
      users.display_name
    FROM office_access AS access
    LEFT JOIN users ON users.id = access.user_id
    ORDER BY
      CASE access.role WHEN 'owner' THEN 0 ELSE 1 END,
      CASE access.status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
      access.invited_at ASC
  `).all<OfficeAccessListItem>()

  return result.results
}

export async function inviteOfficeStaff(
  db: D1Database,
  input: {
    id: string
    email: string
    createdByUserId: string
    now: string
  },
): Promise<OfficeAccessRecord> {
  const normalizedEmail = normalizeOfficeEmail(input.email)
  const existing = await db.prepare(`
    SELECT * FROM office_access
    WHERE invited_email_normalized = ?
    LIMIT 1
  `).bind(normalizedEmail).first<OfficeAccessRecord>()

  if (existing?.status === 'active' || existing?.status === 'pending') {
    throw new OfficeAccessConflictError('That Google account is already invited or approved.')
  }

  if (existing) {
    const nextStatus = existing.user_id && existing.google_sub ? 'active' : 'pending'
    await db.prepare(`
      UPDATE office_access
      SET invited_email = ?,
          role = 'staff',
          status = ?,
          created_by_user_id = ?,
          revoked_by_user_id = NULL,
          invited_at = ?,
          activated_at = CASE WHEN ? = 'active' THEN COALESCE(activated_at, ?) ELSE NULL END,
          revoked_at = NULL,
          updated_at = ?
      WHERE id = ? AND status = 'revoked'
    `).bind(
      input.email.trim(),
      nextStatus,
      input.createdByUserId,
      input.now,
      nextStatus,
      input.now,
      input.now,
      existing.id,
    ).run()

    const restored = await findOfficeAccessById(db, existing.id)

    if (!restored) {
      throw new Error('Restored office access could not be loaded.')
    }

    return restored
  }

  await db.prepare(`
    INSERT INTO office_access (
      id, invited_email, invited_email_normalized, role, status,
      created_by_user_id, invited_at, updated_at
    ) VALUES (?, ?, ?, 'staff', 'pending', ?, ?, ?)
  `).bind(
    input.id,
    input.email.trim(),
    normalizedEmail,
    input.createdByUserId,
    input.now,
    input.now,
  ).run()

  const invitation = await findOfficeAccessById(db, input.id)

  if (!invitation) {
    throw new Error('Office invitation could not be loaded.')
  }

  return invitation
}

export function findOfficeAccessById(
  db: D1Database,
  accessId: string,
): Promise<OfficeAccessRecord | null> {
  return db.prepare('SELECT * FROM office_access WHERE id = ? LIMIT 1')
    .bind(accessId)
    .first<OfficeAccessRecord>()
}

export async function revokeOfficeAccess(
  db: D1Database,
  input: {
    accessId: string
    revokedByUserId: string
    now: string
  },
): Promise<'revoked' | 'not_found' | 'last_owner'> {
  const access = await findOfficeAccessById(db, input.accessId)

  if (!access || access.status === 'revoked') {
    return 'not_found'
  }

  if (access.role === 'owner' && access.status === 'active') {
    const ownerCount = await db.prepare(`
      SELECT COUNT(*) AS count
      FROM office_access
      WHERE role = 'owner' AND status = 'active'
    `).first<{ count: number }>()

    if ((ownerCount?.count ?? 0) <= 1) {
      return 'last_owner'
    }
  }

  const statements = [
    db.prepare(`
      UPDATE office_access
      SET status = 'revoked',
          revoked_by_user_id = ?,
          revoked_at = ?,
          updated_at = ?
      WHERE id = ? AND status != 'revoked'
    `).bind(input.revokedByUserId, input.now, input.now, access.id),
  ]

  if (access.user_id) {
    statements.push(db.prepare(`
      UPDATE app_sessions
      SET revoked_at = ?
      WHERE user_id = ? AND revoked_at IS NULL
    `).bind(input.now, access.user_id))
  }

  await db.batch(statements)
  return 'revoked'
}
