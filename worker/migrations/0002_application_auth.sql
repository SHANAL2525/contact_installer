CREATE TABLE oauth_login_transactions (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  transaction_token_hash TEXT NOT NULL UNIQUE CHECK (length(transaction_token_hash) >= 32),
  state_hash TEXT NOT NULL UNIQUE CHECK (length(state_hash) >= 32),
  nonce_hash TEXT NOT NULL CHECK (length(nonce_hash) >= 32),
  code_verifier TEXT CHECK (
    code_verifier IS NULL OR length(code_verifier) BETWEEN 43 AND 128
  ),
  redirect_uri TEXT NOT NULL CHECK (length(redirect_uri) > 0),
  return_path TEXT NOT NULL DEFAULT '/' CHECK (
    substr(return_path, 1, 1) = '/' AND substr(return_path, 1, 2) != '//'
  ),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE INDEX idx_oauth_login_transactions_active
  ON oauth_login_transactions(transaction_token_hash, expires_at, consumed_at);
CREATE INDEX idx_oauth_login_transactions_cleanup
  ON oauth_login_transactions(expires_at, consumed_at);
