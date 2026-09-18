const GOOGLE_IDENTITY_SCRIPT_ID = 'google-identity-services'
const GOOGLE_IDENTITY_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
const GOOGLE_CONTACTS_SCOPE = 'https://www.googleapis.com/auth/contacts'

interface GoogleTokenResponse {
  access_token?: string
  error?: string
  error_description?: string
  expires_in?: number
}

interface GoogleTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void
}

interface GoogleOAuth2Api {
  initTokenClient: (config: {
    client_id: string
    scope: string
    include_granted_scopes: boolean
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

let accessToken: string | null = null
let accessTokenExpiresAt = 0
let scriptLoadPromise: Promise<GoogleIdentityServices> | null = null

export type GoogleAuthorizationErrorCode = 'not_connected' | 'expired'

export class GoogleAuthorizationError extends Error {
  code: GoogleAuthorizationErrorCode

  constructor(code: GoogleAuthorizationErrorCode, message: string) {
    super(message)
    this.name = 'GoogleAuthorizationError'
    this.code = code
  }
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

export function isGoogleContactsConnected(): boolean {
  if (!accessToken || Date.now() >= accessTokenExpiresAt) {
    accessToken = null
    accessTokenExpiresAt = 0
    return false
  }

  return true
}

export async function googleAuthorizedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  if (!isGoogleContactsConnected() || !accessToken) {
    throw new GoogleAuthorizationError(
      'not_connected',
      'Connect your Google Contacts account before saving.',
    )
  }

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)

  const response = await fetch(input, {
    ...init,
    headers,
  })

  if (response.status === 401) {
    accessToken = null
    accessTokenExpiresAt = 0
    throw new GoogleAuthorizationError(
      'expired',
      'Your Google connection expired. Connect your account again to resume.',
    )
  }

  return response
}

export async function connectGoogleContacts(): Promise<void> {
  const clientId = getGoogleClientId()
  const googleApi = await loadGoogleIdentityServices()

  return new Promise((resolve, reject) => {
    const tokenClient = googleApi.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_CONTACTS_SCOPE,
      include_granted_scopes: true,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error('Google authorization was not completed. Please try again.'))
          return
        }

        const hasContactsScope = googleApi.accounts.oauth2.hasGrantedAllScopes(
          response,
          GOOGLE_CONTACTS_SCOPE,
        )

        if (!hasContactsScope) {
          googleApi.accounts.oauth2.revoke(response.access_token, () => {
            reject(new Error('Google Contacts permission is required to connect.'))
          })
          return
        }

        accessToken = response.access_token
        accessTokenExpiresAt = Date.now() + Math.max(response.expires_in ?? 0, 1) * 1000
        resolve()
      },
      error_callback: () => {
        reject(new Error('Google sign-in was closed or interrupted. Please try again.'))
      },
    })

    tokenClient.requestAccessToken({ prompt: 'consent' })
  })
}

export async function disconnectGoogleContacts(): Promise<void> {
  const tokenToRevoke = accessToken

  accessToken = null
  accessTokenExpiresAt = 0

  if (!tokenToRevoke) {
    return
  }

  const googleApi = await loadGoogleIdentityServices()

  await new Promise<void>((resolve) => {
    googleApi.accounts.oauth2.revoke(tokenToRevoke, resolve)
  })
}
