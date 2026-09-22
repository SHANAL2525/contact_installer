import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose'
import { sha256Base64Url, timingSafeEqual } from '../security/crypto'

const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs')
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

export interface VerifiedGoogleIdentity {
  sub: string
  email: string
  emailVerified: true
  displayName: string | null
}
export interface VerifyGoogleIdTokenInput {
  idToken: string
  audience: string
  expectedNonceHash: string
  now?: Date
}

export interface GoogleIdentityVerifier {
  verifyIdToken(input: VerifyGoogleIdTokenInput): Promise<VerifiedGoogleIdentity>
}

export class GoogleIdentityVerificationError extends Error {
  readonly code: 'invalid_id_token' | 'invalid_identity' | 'nonce_mismatch'

  constructor(
    code: GoogleIdentityVerificationError['code'],
    message = 'Google identity verification failed.',
  ) {
    super(message)
    this.name = 'GoogleIdentityVerificationError'
    this.code = code
  }
}

export class JoseGoogleIdentityVerifier implements GoogleIdentityVerifier {
  constructor(
    private readonly keyResolver: JWTVerifyGetKey = createRemoteJWKSet(GOOGLE_JWKS_URL),
  ) {}

  async verifyIdToken(input: VerifyGoogleIdTokenInput): Promise<VerifiedGoogleIdentity> {
    let payload

    try {
      const verified = await jwtVerify(input.idToken, this.keyResolver, {
        algorithms: ['RS256'],
        audience: input.audience,
        issuer: GOOGLE_ISSUERS,
        currentDate: input.now,
      })
      payload = verified.payload
    } catch {
      throw new GoogleIdentityVerificationError('invalid_id_token')
    }

    if (typeof payload.nonce !== 'string') {
      throw new GoogleIdentityVerificationError('nonce_mismatch')
    }

    const receivedNonceHash = await sha256Base64Url(payload.nonce)

    if (!timingSafeEqual(receivedNonceHash, input.expectedNonceHash)) {
      throw new GoogleIdentityVerificationError('nonce_mismatch')
    }

    if (
      typeof payload.sub !== 'string'
      || payload.sub.length === 0
      || payload.sub.length > 255
      || typeof payload.email !== 'string'
      || !payload.email.includes('@')
      || payload.email_verified !== true
    ) {
      throw new GoogleIdentityVerificationError('invalid_identity')
    }

    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: true,
      displayName: typeof payload.name === 'string' && payload.name.trim()
        ? payload.name.trim()
        : null,
    }
  }
}
