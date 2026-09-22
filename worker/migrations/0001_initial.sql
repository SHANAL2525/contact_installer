PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  google_sub TEXT NOT NULL UNIQUE CHECK (length(google_sub) > 0),
  primary_email TEXT NOT NULL CHECK (instr(primary_email, '@') > 1),
  email_verified INTEGER NOT NULL DEFAULT 1 CHECK (email_verified = 1),
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deletion_pending', 'deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE app_sessions (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  user_id TEXT NOT NULL,
  session_token_hash TEXT NOT NULL UNIQUE CHECK (length(session_token_hash) >= 32),
  csrf_secret_hash TEXT NOT NULL CHECK (length(csrf_secret_hash) >= 32),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE google_accounts (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  user_id TEXT NOT NULL,
  google_sub TEXT NOT NULL UNIQUE CHECK (length(google_sub) > 0),
  email TEXT NOT NULL CHECK (instr(email, '@') > 1),
  email_verified INTEGER NOT NULL DEFAULT 1 CHECK (email_verified = 1),
  status TEXT NOT NULL DEFAULT 'reauthorization_required'
    CHECK (status IN ('connected', 'reauthorization_required', 'disconnected')),
  connected_at TEXT NOT NULL,
  last_authorized_at TEXT,
  disconnected_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, id),
  UNIQUE (user_id, google_sub),
  FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE import_batches (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  user_id TEXT NOT NULL,
  source_file_name TEXT NOT NULL CHECK (length(source_file_name) > 0),
  source_file_type TEXT NOT NULL CHECK (source_file_type IN ('xlsx', 'xls', 'csv', 'manual')),
  source_row_count INTEGER NOT NULL DEFAULT 0 CHECK (source_row_count >= 0),
  valid_contact_count INTEGER NOT NULL DEFAULT 0 CHECK (valid_contact_count >= 0),
  duplicate_contact_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_contact_count >= 0),
  invalid_contact_count INTEGER NOT NULL DEFAULT 0 CHECK (invalid_contact_count >= 0),
  status TEXT NOT NULL DEFAULT 'prepared'
    CHECK (status IN ('prepared', 'saving', 'paused', 'completed', 'partial', 'failed', 'cancelled')),
  resume_payload_ciphertext BLOB,
  resume_payload_nonce BLOB,
  resume_payload_key_version INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (user_id, id),
  CHECK (
    (resume_payload_ciphertext IS NULL AND resume_payload_nonce IS NULL AND resume_payload_key_version IS NULL)
    OR
    (resume_payload_ciphertext IS NOT NULL AND resume_payload_nonce IS NOT NULL AND resume_payload_key_version > 0)
  ),
  FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE import_destinations (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  user_id TEXT NOT NULL,
  import_batch_id TEXT NOT NULL,
  google_account_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'checking', 'saving', 'paused', 'completed', 'partial', 'failed', 'cancelled')),
  total_contact_count INTEGER NOT NULL DEFAULT 0 CHECK (total_contact_count >= 0),
  saved_count INTEGER NOT NULL DEFAULT 0 CHECK (saved_count >= 0),
  skipped_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  duplicate_check_completed_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, id),
  UNIQUE (user_id, import_batch_id, google_account_id),
  UNIQUE (user_id, id, import_batch_id),
  UNIQUE (user_id, id, import_batch_id, google_account_id),
  FOREIGN KEY (user_id, import_batch_id)
    REFERENCES import_batches(user_id, id) ON UPDATE RESTRICT ON DELETE CASCADE,
  FOREIGN KEY (user_id, google_account_id)
    REFERENCES google_accounts(user_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE saved_contacts (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  user_id TEXT NOT NULL,
  import_batch_id TEXT NOT NULL,
  import_destination_id TEXT NOT NULL,
  google_account_id TEXT NOT NULL,
  source_contact_key TEXT NOT NULL CHECK (length(source_contact_key) > 0),
  contact_fingerprint TEXT NOT NULL CHECK (length(contact_fingerprint) >= 32),
  google_resource_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'saved', 'skipped', 'failed', 'uncertain')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code TEXT,
  payload_ciphertext BLOB,
  payload_nonce BLOB,
  payload_key_version INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  saved_at TEXT,
  UNIQUE (user_id, id),
  UNIQUE (user_id, import_destination_id, source_contact_key),
  UNIQUE (user_id, google_account_id, google_resource_name),
  UNIQUE (user_id, id, import_batch_id, import_destination_id),
  CHECK (
    (payload_ciphertext IS NULL AND payload_nonce IS NULL AND payload_key_version IS NULL)
    OR
    (payload_ciphertext IS NOT NULL AND payload_nonce IS NOT NULL AND payload_key_version > 0)
  ),
  FOREIGN KEY (user_id, import_destination_id, import_batch_id, google_account_id)
    REFERENCES import_destinations(user_id, id, import_batch_id, google_account_id)
    ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE save_events (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  user_id TEXT NOT NULL,
  import_batch_id TEXT NOT NULL,
  import_destination_id TEXT NOT NULL,
  saved_contact_id TEXT,
  event_type TEXT NOT NULL CHECK (length(event_type) > 0),
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'succeeded', 'skipped', 'failed', 'uncertain')),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) >= 16),
  details_json TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, id),
  UNIQUE (user_id, idempotency_key),
  FOREIGN KEY (user_id, import_destination_id, import_batch_id)
    REFERENCES import_destinations(user_id, id, import_batch_id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  FOREIGN KEY (user_id, saved_contact_id, import_batch_id, import_destination_id)
    REFERENCES saved_contacts(user_id, id, import_batch_id, import_destination_id)
    ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE INDEX idx_app_sessions_user_expiry
  ON app_sessions(user_id, expires_at);
CREATE INDEX idx_app_sessions_active_hash
  ON app_sessions(session_token_hash, revoked_at, expires_at);
CREATE INDEX idx_google_accounts_user_status
  ON google_accounts(user_id, status);
CREATE INDEX idx_import_batches_user_created
  ON import_batches(user_id, created_at DESC);
CREATE INDEX idx_import_batches_user_status
  ON import_batches(user_id, status);
CREATE INDEX idx_import_destinations_batch_status
  ON import_destinations(user_id, import_batch_id, status);
CREATE INDEX idx_saved_contacts_destination_status
  ON saved_contacts(user_id, import_destination_id, status);
CREATE INDEX idx_saved_contacts_account_fingerprint
  ON saved_contacts(user_id, google_account_id, contact_fingerprint);
CREATE INDEX idx_save_events_destination_created
  ON save_events(user_id, import_destination_id, created_at);
CREATE INDEX idx_save_events_contact_created
  ON save_events(user_id, saved_contact_id, created_at);
