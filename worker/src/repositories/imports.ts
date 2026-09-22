export interface ImportBatchRecord {
  id: string
  user_id: string
  source_file_name: string
  source_file_type: 'xlsx' | 'xls' | 'csv' | 'manual'
  source_row_count: number
  valid_contact_count: number
  duplicate_contact_count: number
  invalid_contact_count: number
  status: string
  created_at: string
  updated_at: string
  completed_at: string | null
}
export interface ImportDestinationRecord {
  id: string
  user_id: string
  import_batch_id: string
  google_account_id: string
  status: string
  created_at: string
  updated_at: string
}

export interface SavedContactRecord {
  id: string
  user_id: string
  import_batch_id: string
  import_destination_id: string
  google_account_id: string
  source_contact_key: string
  contact_fingerprint: string
  google_resource_name: string | null
  status: 'pending' | 'saved' | 'skipped' | 'failed' | 'uncertain'
  attempt_count: number
  created_at: string
  updated_at: string
}

export interface CreateImportBatchInput {
  id: string
  userId: string
  sourceFileName: string
  sourceFileType: 'xlsx' | 'xls' | 'csv' | 'manual'
  sourceRowCount: number
  validContactCount: number
  duplicateContactCount: number
  invalidContactCount: number
  now: string
}

export async function createImportBatch(
  db: D1Database,
  input: CreateImportBatchInput,
): Promise<ImportBatchRecord> {
  await db.prepare(`
    INSERT INTO import_batches (
      id, user_id, source_file_name, source_file_type, source_row_count,
      valid_contact_count, duplicate_contact_count, invalid_contact_count,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'prepared', ?, ?)
  `).bind(
    input.id,
    input.userId,
    input.sourceFileName,
    input.sourceFileType,
    input.sourceRowCount,
    input.validContactCount,
    input.duplicateContactCount,
    input.invalidContactCount,
    input.now,
    input.now,
  ).run()

  const batch = await findImportBatchForUser(db, input.userId, input.id)

  if (!batch) {
    throw new Error('Created import batch could not be loaded.')
  }

  return batch
}

export function findImportBatchForUser(
  db: D1Database,
  userId: string,
  batchId: string,
): Promise<ImportBatchRecord | null> {
  return db.prepare(`
    SELECT * FROM import_batches
    WHERE user_id = ? AND id = ?
    LIMIT 1
  `).bind(userId, batchId).first<ImportBatchRecord>()
}

export interface CreateImportDestinationInput {
  id: string
  userId: string
  importBatchId: string
  googleAccountId: string
  totalContactCount: number
  now: string
}

export async function createImportDestination(
  db: D1Database,
  input: CreateImportDestinationInput,
): Promise<ImportDestinationRecord> {
  await db.prepare(`
    INSERT INTO import_destinations (
      id, user_id, import_batch_id, google_account_id, status,
      total_contact_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
  `).bind(
    input.id,
    input.userId,
    input.importBatchId,
    input.googleAccountId,
    input.totalContactCount,
    input.now,
    input.now,
  ).run()

  const destination = await findImportDestinationForUser(db, input.userId, input.id)

  if (!destination) {
    throw new Error('Created import destination could not be loaded.')
  }

  return destination
}

export function findImportDestinationForUser(
  db: D1Database,
  userId: string,
  destinationId: string,
): Promise<ImportDestinationRecord | null> {
  return db.prepare(`
    SELECT * FROM import_destinations
    WHERE user_id = ? AND id = ?
    LIMIT 1
  `).bind(userId, destinationId).first<ImportDestinationRecord>()
}

export interface CreateSavedContactInput {
  id: string
  userId: string
  importBatchId: string
  importDestinationId: string
  googleAccountId: string
  sourceContactKey: string
  contactFingerprint: string
  status: SavedContactRecord['status']
  now: string
}

export async function createSavedContact(
  db: D1Database,
  input: CreateSavedContactInput,
): Promise<SavedContactRecord> {
  await db.prepare(`
    INSERT INTO saved_contacts (
      id, user_id, import_batch_id, import_destination_id, google_account_id,
      source_contact_key, contact_fingerprint, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.id,
    input.userId,
    input.importBatchId,
    input.importDestinationId,
    input.googleAccountId,
    input.sourceContactKey,
    input.contactFingerprint,
    input.status,
    input.now,
    input.now,
  ).run()

  const contact = await db.prepare(`
    SELECT * FROM saved_contacts
    WHERE user_id = ? AND id = ?
    LIMIT 1
  `).bind(input.userId, input.id).first<SavedContactRecord>()

  if (!contact) {
    throw new Error('Created saved-contact record could not be loaded.')
  }

  return contact
}

export interface CreateSaveEventInput {
  id: string
  userId: string
  importBatchId: string
  importDestinationId: string
  savedContactId?: string | null
  eventType: string
  outcome: 'accepted' | 'succeeded' | 'skipped' | 'failed' | 'uncertain'
  idempotencyKey: string
  now: string
}

export async function createSaveEvent(
  db: D1Database,
  input: CreateSaveEventInput,
): Promise<void> {
  await db.prepare(`
    INSERT INTO save_events (
      id, user_id, import_batch_id, import_destination_id, saved_contact_id,
      event_type, outcome, idempotency_key, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.id,
    input.userId,
    input.importBatchId,
    input.importDestinationId,
    input.savedContactId ?? null,
    input.eventType,
    input.outcome,
    input.idempotencyKey,
    input.now,
  ).run()
}

export async function listImportHistoryForUser(
  db: D1Database,
  userId: string,
): Promise<ImportBatchRecord[]> {
  const result = await db.prepare(`
    SELECT * FROM import_batches
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).bind(userId).all<ImportBatchRecord>()

  return result.results
}
