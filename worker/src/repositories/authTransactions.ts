export interface OAuthLoginTransactionRecord {
  id: string
  transaction_token_hash: string
  state_hash: string
  nonce_hash: string
  code_verifier: string | null
  redirect_uri: string
  return_path: string
  created_at: string
  expires_at: string
  consumed_at: string | null
}
export interface CreateOAuthLoginTransactionInput {
  id: string
  transactionTokenHash: string
  stateHash: string
  nonceHash: string
  codeVerifier: string
  redirectUri: string
  returnPath: string
  createdAt: string
  expiresAt: string
}

export async function createOAuthLoginTransaction(
  db: D1Database,
  input: CreateOAuthLoginTransactionInput,
): Promise<void> {
  await db.prepare(`
    INSERT INTO oauth_login_transactions (
      id, transaction_token_hash, state_hash, nonce_hash, code_verifier,
      redirect_uri, return_path, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.id,
    input.transactionTokenHash,
    input.stateHash,
    input.nonceHash,
    input.codeVerifier,
    input.redirectUri,
    input.returnPath,
    input.createdAt,
    input.expiresAt,
  ).run()
}

export function findActiveOAuthLoginTransaction(
  db: D1Database,
  transactionTokenHash: string,
  now: string,
): Promise<OAuthLoginTransactionRecord | null> {
  return db.prepare(`
    SELECT * FROM oauth_login_transactions
    WHERE transaction_token_hash = ?
      AND consumed_at IS NULL
      AND expires_at > ?
    LIMIT 1
  `).bind(transactionTokenHash, now).first<OAuthLoginTransactionRecord>()
}

export async function consumeOAuthLoginTransaction(
  db: D1Database,
  transactionId: string,
  consumedAt: string,
): Promise<boolean> {
  const result = await db.prepare(`
    UPDATE oauth_login_transactions
    SET consumed_at = ?, code_verifier = NULL
    WHERE id = ? AND consumed_at IS NULL
  `).bind(consumedAt, transactionId).run()

  return result.meta.changes === 1
}
