import { readStorage, writeStorage } from '../utils/storage'

const GOOGLE_IDENTITY_SCRIPT_ID = 'google-identity-services'
const GOOGLE_IDENTITY_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
const GOOGLE_CONTACTS_SCOPE = 'https://www.googleapis.com/auth/contacts'
const GOOGLE_IDENTITY_SCOPES = ['openid', 'email'] as const
const GOOGLE_ACCOUNT_STORAGE_KEY = 'google-account-profiles-v1'

interface GoogleTokenResponse {
  access_token?: string
  error?: string
  error_description?: string
  expires_in?: number
}

interface GoogleTokenClient {
  requestAccessToken: (overrideConfig?: {
    prompt?: string
    login_hint?: string
  }) => void
}

interface GoogleOAuth2Api {
  initTokenClient: (config: {
    client_id: string
    scope: string
    include_granted_scopes: boolean
    prompt?: string
    login_hint?: string
    callback: (response: GoogleTokenResponse) => void
    error_callback: () => void
  }) => GoogleTokenClient
  hasGrantedAllScopes: (
    response: GoogleTokenResponse,
    ...scopes: string[]
  ) => boolean
  revoke: (accessToken: string, done: () => void) => void
}

interface GoogleIdentityServices {
  accounts: {
    oauth2: GoogleOAuth2Api
  }
}

type GoogleWindow = Window & {
  google?: GoogleIdentityServices
}

interface GoogleUserInfoResponse {
  sub?: unknown
  email?: unknown
  email_verified?: unknown
}

interface StoredGoogleAccountProfile {
  id: string
  email: string
  addedAt: string
  lastAuthorizedAt: string
}

interface InMemoryAuthorization {
  accessToken: string
  expiresAt: number
  expiryTimer: number
}

export type GoogleAccountStatus = 'connected' | 'authorization_required'

export interface GoogleAccount {
  id: string
  email: string
  addedAt: string
  lastAuthorizedAt: string
  status: GoogleAccountStatus
}

let scriptLoadPromise: Promise<GoogleIdentityServices> | null = null
let authorizationInProgress = false
const authorizations = new Map<string, InMemoryAuthorization>()
const accountListeners = new Set<() => void>()

function isStoredGoogleAccountProfile(value: unknown): value is StoredGoogleAccountProfile {
  if (!value || typeof value !== 'object') {
    return false
  }

  const profile = value as Partial<StoredGoogleAccountProfile>
  return (
    typeof profile.id === 'string'
    && profile.id.length > 0
    && typeof profile.email === 'string'
    && profile.email.includes('@')
    && typeof profile.addedAt === 'string'
    && typeof profile.lastAuthorizedAt === 'string'
  )
}

function loadStoredProfiles(): StoredGoogleAccountProfile[] {
  const storedValue = readStorage<unknown>(GOOGLE_ACCOUNT_STORAGE_KEY, [])

  if (!Array.isArray(storedValue)) {
    return []
  }

  const uniqueProfiles = new Map<string, StoredGoogleAccountProfile>()

  storedValue.forEach((value) => {
    if (isStoredGoogleAccountProfile(value)) {
      uniqueProfiles.set(value.id, value)
    }
  })

  return Array.from(uniqueProfiles.values())
}

let storedProfiles = loadStoredProfiles()

function persistProfiles(): void {
  writeStorage(GOOGLE_ACCOUNT_STORAGE_KEY, storedProfiles)
}

function notifyAccountListeners(): void {
  accountListeners.forEach((listener) => listener())
}

function getGoogleClientId(): string {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()

  if (!clientId || clientId === 'PASTE_YOUR_GOOGLE_CLIENT_ID_HERE') {
    throw new Error('Google OAuth is not configured. Add a valid Client ID and restart the app.')
  }

  return clientId
}

function getLoadedGoogleApi(): GoogleIdentityServices | undefined {
  return (window as GoogleWindow).google
}

function loadGoogleIdentityServices(): Promise<GoogleIdentityServices> {
  const loadedApi = getLoadedGoogleApi()

  if (loadedApi) {
    return Promise.resolve(loadedApi)
  }

  if (scriptLoadPromise) {
    return scriptLoadPromise
  }

  const loadPromise = new Promise<GoogleIdentityServices>((resolve, reject) => {
    const handleLoad = () => {
      const googleApi = getLoadedGoogleApi()

      if (googleApi) {
        resolve(googleApi)
        return
      }

      reject(new Error('Google sign-in could not be loaded. Please try again.'))
    }

    const handleError = () => {
      reject(new Error('Google sign-in could not be loaded. Check your connection and try again.'))
    }

    const existingScript = document.getElementById(GOOGLE_IDENTITY_SCRIPT_ID)

    if (existingScript) {
      existingScript.addEventListener('load', handleLoad, { once: true })
      existingScript.addEventListener('error', handleError, { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = GOOGLE_IDENTITY_SCRIPT_ID
    script.src = GOOGLE_IDENTITY_SCRIPT_URL
    script.async = true
    script.defer = true
    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', handleError, { once: true })
    document.head.appendChild(script)
  }).catch((error: unknown) => {
    scriptLoadPromise = null
    throw error
  })

  scriptLoadPromise = loadPromise
  return loadPromise
}

function clearAuthorization(accountId: string): InMemoryAuthorization | undefined {
  const authorization = authorizations.get(accountId)

  if (authorization) {
    window.clearTimeout(authorization.expiryTimer)
    authorizations.delete(accountId)
  }

  return authorization
}

function hasActiveAuthorization(accountId: string): boolean {
  const authorization = authorizations.get(accountId)

  if (!authorization) {
    return false
  }

  if (Date.now() >= authorization.expiresAt) {
    clearAuthorization(accountId)
    return false
  }

  return true
}

function storeAuthorization(
  accountId: string,
  accessToken: string,
  expiresInSeconds: number,
): void {
  clearAuthorization(accountId)

  const expiresAt = Date.now() + Math.max(expiresInSeconds, 1) * 1000
  const expiryTimer = window.setTimeout(() => {
    if (clearAuthorization(accountId)) {
      notifyAccountListeners()
    }
  }, Math.max(expiresAt - Date.now(), 1))

  authorizations.set(accountId, {
    accessToken,
    expiresAt,
    expiryTimer,
  })
}

async function fetchVerifiedGoogleIdentity(accessToken: string): Promise<{
  id: string
  email: string
}> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error('Google account identity could not be verified. Please try again.')
  }

  const userInfo = await response.json() as GoogleUserInfoResponse

  if (
    typeof userInfo.sub !== 'string'
    || !userInfo.sub
    || typeof userInfo.email !== 'string'
    || !userInfo.email.includes('@')
    || userInfo.email_verified !== true
  ) {
    throw new Error('Google did not return a verified account identity.')
  }

  return {
    id: userInfo.sub,
    email: userInfo.email,
  }
}

async function authorizeGoogleAccount(expectedAccountId?: string): Promise<GoogleAccount> {
  if (authorizationInProgress) {
    throw new Error('Another Google authorization is already in progress.')
  }

  const expectedProfile = expectedAccountId
    ? storedProfiles.find((profile) => profile.id === expectedAccountId)
    : undefined

  if (expectedAccountId && !expectedProfile) {
    throw new Error('This Google account is no longer registered in the app.')
  }

  authorizationInProgress = true

  try {
    const clientId = getGoogleClientId()
    const googleApi = await loadGoogleIdentityServices()
    const tokenResponse = await new Promise<GoogleTokenResponse>((resolve, reject) => {
      const tokenClient = googleApi.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: [...GOOGLE_IDENTITY_SCOPES, GOOGLE_CONTACTS_SCOPE].join(' '),
        include_granted_scopes: false,
        prompt: expectedProfile ? '' : 'select_account',
        login_hint: expectedProfile?.id,
        callback: (response) => {
          if (response.error || !response.access_token) {
            reject(new Error('Google authorization was not completed. Please try again.'))
            return
          }

          resolve(response)
        },
        error_callback: () => {
          reject(new Error('Google sign-in was closed or interrupted. Please try again.'))
        },
      })

      tokenClient.requestAccessToken()
    })

    const accessToken = tokenResponse.access_token

    if (!accessToken) {
      throw new Error('Google did not return an access token.')
    }

    const hasRequiredScopes = googleApi.accounts.oauth2.hasGrantedAllScopes(
      tokenResponse,
      ...GOOGLE_IDENTITY_SCOPES,
      GOOGLE_CONTACTS_SCOPE,
    )

    if (!hasRequiredScopes) {
      throw new Error('Google Contacts and verified email permissions are required.')
    }

    const identity = await fetchVerifiedGoogleIdentity(accessToken)

    if (expectedAccountId && identity.id !== expectedAccountId) {
      throw new Error(
        `The selected Google account does not match ${expectedProfile?.email}. No authorization was changed.`,
      )
    }

    const now = new Date().toISOString()
    const existingProfile = storedProfiles.find((profile) => profile.id === identity.id)
    const profile: StoredGoogleAccountProfile = {
      id: identity.id,
      email: identity.email,
      addedAt: existingProfile?.addedAt ?? now,
      lastAuthorizedAt: now,
    }

    storedProfiles = [
      ...storedProfiles.filter((storedProfile) => storedProfile.id !== identity.id),
      profile,
    ].sort((first, second) => first.addedAt.localeCompare(second.addedAt))

    storeAuthorization(identity.id, accessToken, tokenResponse.expires_in ?? 0)
    persistProfiles()
    notifyAccountListeners()

    return {
      ...profile,
      status: 'connected',
    }
  } finally {
    authorizationInProgress = false
  }
}

export function getGoogleAccounts(): GoogleAccount[] {
  return storedProfiles.map((profile) => ({
    ...profile,
    status: hasActiveAuthorization(profile.id)
      ? 'connected'
      : 'authorization_required',
  }))
}

export function subscribeToGoogleAccounts(listener: () => void): () => void {
  accountListeners.add(listener)
  return () => accountListeners.delete(listener)
}

export function connectGoogleAccount(): Promise<GoogleAccount> {
  return authorizeGoogleAccount()
}

export function reauthorizeGoogleAccount(accountId: string): Promise<GoogleAccount> {
  return authorizeGoogleAccount(accountId)
}

export async function disconnectGoogleAccount(accountId: string): Promise<void> {
  const authorization = clearAuthorization(accountId)
  storedProfiles = storedProfiles.filter((profile) => profile.id !== accountId)
  persistProfiles()
  notifyAccountListeners()

  if (!authorization) {
    return
  }

  const googleApi = await loadGoogleIdentityServices()

  await new Promise<void>((resolve) => {
    googleApi.accounts.oauth2.revoke(authorization.accessToken, resolve)
  })
}

export function isGoogleAccountAuthorized(accountId: string): boolean {
  return storedProfiles.some((profile) => profile.id === accountId)
    && hasActiveAuthorization(accountId)
}

export function getGoogleAccount(accountId: string): GoogleAccount | null {
  return getGoogleAccounts().find((account) => account.id === accountId) ?? null
}

export type GoogleAuthorizationErrorCode = 'not_connected' | 'expired'

export class GoogleAuthorizationError extends Error {
  code: GoogleAuthorizationErrorCode

  constructor(code: GoogleAuthorizationErrorCode, message: string) {
    super(message)
    this.name = 'GoogleAuthorizationError'
    this.code = code
  }
}

export async function googleAuthorizedFetch(
  accountId: string,
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const profile = storedProfiles.find((account) => account.id === accountId)
  const authorization = authorizations.get(accountId)

  if (!profile || !authorization || !hasActiveAuthorization(accountId)) {
    throw new GoogleAuthorizationError(
      'not_connected',
      profile
        ? `Reauthorize ${profile.email} before continuing.`
        : 'The selected Google account is no longer registered.',
    )
  }

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${authorization.accessToken}`)

  const response = await fetch(input, {
    ...init,
    headers,
  })

  if (response.status === 401) {
    clearAuthorization(accountId)
    notifyAccountListeners()
    throw new GoogleAuthorizationError(
      'expired',
      `The authorization for ${profile.email} expired. Reauthorize that account to continue.`,
    )
  }

  return response
}
