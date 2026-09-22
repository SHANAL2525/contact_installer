import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
} from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'
import { JoseGoogleIdentityVerifier } from '../src/services/googleIdentity'
import { sha256Base64Url } from '../src/security/crypto'

const now = new Date('2026-01-01T00:00:00.000Z')
const audience = 'synthetic-client-id.apps.example.invalid'
const nonce = 'synthetic-one-time-nonce'
let verifier: JoseGoogleIdentityVerifier
let privateKey: CryptoKey
let otherPrivateKey: CryptoKey

beforeAll(async () => {
  const keyPair = await generateKeyPair('RS256', { extractable: true })
  const otherKeyPair = await generateKeyPair('RS256', { extractable: true })
  privateKey = keyPair.privateKey
  otherPrivateKey = otherKeyPair.privateKey
  const publicJwk = await exportJWK(keyPair.publicKey) as JWK
  publicJwk.kid = 'synthetic-key'
  publicJwk.alg = 'RS256'
  verifier = new JoseGoogleIdentityVerifier(createLocalJWKSet({ keys: [publicJwk] }))
})

async function signToken(overrides: Record<string, unknown> = {}, key = privateKey) {
  const issuedAt = Math.floor(now.getTime() / 1000)
  return new SignJWT({
    sub: 'verified-google-sub',
    email: 'verified@example.invalid',
    email_verified: true,
    name: 'Verified User',
    nonce,
    ...overrides,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'synthetic-key' })
    .setIssuer('https://accounts.google.com')
    .setAudience(audience)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 300)
    .sign(key)
}

describe('Google ID-token verification', () => {
  it('accepts a valid signed token and uses immutable sub as identity', async () => {
    const identity = await verifier.verifyIdToken({
      idToken: await signToken(),
      audience,
      expectedNonceHash: await sha256Base64Url(nonce),
      now,
    })

    expect(identity).toEqual({
      sub: 'verified-google-sub',
      email: 'verified@example.invalid',
      emailVerified: true,
      displayName: 'Verified User',
    })
  })

  it('rejects an invalid signature, audience, expiry, and nonce', async () => {
    const expectedNonceHash = await sha256Base64Url(nonce)
    const issuedAt = Math.floor(now.getTime() / 1000)
    const expired = new SignJWT({
      sub: 'verified-google-sub',
      email: 'verified@example.invalid',
      email_verified: true,
      nonce,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'synthetic-key' })
      .setIssuer('https://accounts.google.com')
      .setAudience(audience)
      .setIssuedAt(issuedAt - 600)
      .setExpirationTime(issuedAt - 300)
      .sign(privateKey)

    await expect(verifier.verifyIdToken({
      idToken: await signToken({}, otherPrivateKey), audience, expectedNonceHash, now,
    })).rejects.toMatchObject({ code: 'invalid_id_token' })
    await expect(verifier.verifyIdToken({
      idToken: await signToken(), audience: 'wrong-audience', expectedNonceHash, now,
    })).rejects.toMatchObject({ code: 'invalid_id_token' })
    await expect(verifier.verifyIdToken({
      idToken: await expired, audience, expectedNonceHash, now,
    })).rejects.toMatchObject({ code: 'invalid_id_token' })
    await expect(verifier.verifyIdToken({
      idToken: await signToken(), audience, expectedNonceHash: await sha256Base64Url('wrong'), now,
    })).rejects.toMatchObject({ code: 'nonce_mismatch' })
  })

  it('rejects a token from an untrusted issuer', async () => {
    const issuedAt = Math.floor(now.getTime() / 1000)
    const token = await new SignJWT({
      sub: 'verified-google-sub',
      email: 'verified@example.invalid',
      email_verified: true,
      nonce,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'synthetic-key' })
      .setIssuer('https://issuer.example.invalid')
      .setAudience(audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 300)
      .sign(privateKey)

    await expect(verifier.verifyIdToken({
      idToken: token,
      audience,
      expectedNonceHash: await sha256Base64Url(nonce),
      now,
    })).rejects.toMatchObject({ code: 'invalid_id_token' })
  })

  it('rejects an unverified email identity', async () => {
    await expect(verifier.verifyIdToken({
      idToken: await signToken({ email_verified: false }),
      audience,
      expectedNonceHash: await sha256Base64Url(nonce),
      now,
    })).rejects.toMatchObject({ code: 'invalid_identity' })
  })
})
