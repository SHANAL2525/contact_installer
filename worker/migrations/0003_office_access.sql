PRAGMA foreign_keys = ON;

CREATE UNIQUE INDEX idx_users_id_google_sub
  ON users(id, google_sub);

CREATE TABLE office_access (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  invited_email TEXT NOT NULL CHECK (instr(invited_email, '@') > 1),
  invited_email_normalized TEXT NOT NULL UNIQUE
    CHECK (
      invited_email_normalized = lower(trim(invited_email_normalized))
      AND instr(invited_email_normalized, '@') > 1
    ),
  user_id TEXT UNIQUE,
  google_sub TEXT UNIQUE CHECK (google_sub IS NULL OR length(google_sub) > 0),
  role TEXT NOT NULL CHECK (role IN ('owner', 'staff')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'revoked')),
  created_by_user_id TEXT,
  revoked_by_user_id TEXT,
  invited_at TEXT NOT NULL,
  activated_at TEXT,
  revoked_at TEXT,
  updated_at TEXT NOT NULL,
  CHECK (
    (user_id IS NULL AND google_sub IS NULL)
    OR
    (user_id IS NOT NULL AND google_sub IS NOT NULL)
  ),
  CHECK (
    status != 'pending'
    OR (user_id IS NULL AND google_sub IS NULL AND activated_at IS NULL AND revoked_at IS NULL)
  ),
  CHECK (
    status != 'active'
    OR (user_id IS NOT NULL AND google_sub IS NOT NULL AND activated_at IS NOT NULL AND revoked_at IS NULL)
  ),
  CHECK (status != 'revoked' OR revoked_at IS NOT NULL),
  FOREIGN KEY (user_id, google_sub)
    REFERENCES users(id, google_sub) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id)
    REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (revoked_by_user_id)
    REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_office_access_status_role
  ON office_access(status, role);
CREATE INDEX idx_office_access_user_status
  ON office_access(user_id, status);
