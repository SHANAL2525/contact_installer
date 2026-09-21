export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  APP_ENV: 'local' | 'preview' | 'production'
  FRONTEND_ORIGIN?: string
  GOOGLE_LOGIN_CLIENT_ID?: string
  GOOGLE_LOGIN_CLIENT_SECRET?: string
  GOOGLE_LOGIN_REDIRECT_URI?: string
  SESSION_TTL_SECONDS?: string
}

export interface AuthenticatedUser {
  id: string
  googleSub: string
  sessionId: string
  email: string
  displayName: string | null
  csrfSecretHash: string
  expiresAt: string
  officeAccessId: string
  role: 'owner' | 'staff'
}

export interface RequestContext {
  request: Request
  env: Env
  executionContext: ExecutionContext
  user?: AuthenticatedUser
}

export interface EncryptedPayloadEnvelope {
  algorithm: 'AES-GCM'
  ciphertext: ArrayBuffer
  nonce: ArrayBuffer
  keyVersion: number
}
