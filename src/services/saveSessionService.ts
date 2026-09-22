import type { ProcessedContact } from '../types/contact'
import type {
  SaveContactItem,
  SaveSession,
  SaveSessionRecord,
} from '../types/saveSession'
import { readStorage, writeStorage } from '../utils/storage'
import {
  getGoogleAccount,
  GoogleAuthorizationError,
  isGoogleAccountAuthorized,
} from './googleAuthService'
import {
  createGoogleContact,
  GoogleContactsRequestError,
  listExistingGooglePhoneNumbers,
} from './googleContactsService'

const DATABASE_NAME = 'contact-auto-save'
const DATABASE_VERSION = 1
const SESSION_STORE = 'saveSessions'
const ITEM_STORE = 'saveSessionItems'
const SESSION_INDEX = 'sessionId'
const CURRENT_SESSION_KEY = 'current-save-session-id'

type SaveProgressListener = (session: SaveSession) => void

type ActiveSaveRun = {
  promise: Promise<SaveSession> | null
  listeners: Set<SaveProgressListener>
}

const activeSaveRuns = new Map<string, ActiveSaveRun>()
let databasePromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) {
    return databasePromise
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.addEventListener('upgradeneeded', () => {
      const database = request.result

      if (!database.objectStoreNames.contains(SESSION_STORE)) {
        database.createObjectStore(SESSION_STORE, { keyPath: 'id' })
      }

      if (!database.objectStoreNames.contains(ITEM_STORE)) {
        const itemStore = database.createObjectStore(ITEM_STORE, { keyPath: 'key' })
        itemStore.createIndex(SESSION_INDEX, 'sessionId', { unique: false })
      }
    })

    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => {
      databasePromise = null
      reject(new Error('Unable to open saved import history in this browser.'))
    })
  })

  return databasePromise
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => reject(request.error))
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve())
    transaction.addEventListener('abort', () => reject(transaction.error))
    transaction.addEventListener('error', () => reject(transaction.error))
  })
}

function normalizeSessionRecord(record: SaveSessionRecord): SaveSessionRecord {
  const isAccountSpecific = (
    record.schemaVersion === 2
    && typeof record.destinationAccountId === 'string'
    && record.destinationAccountId.length > 0
    && typeof record.destinationEmail === 'string'
    && record.destinationEmail.includes('@')
  )

  return {
    ...record,
    schemaVersion: isAccountSpecific ? 2 : 1,
    destinationAccountId: isAccountSpecific ? record.destinationAccountId : null,
    destinationEmail: isAccountSpecific ? record.destinationEmail : null,
    sourceSkippedCount: Number.isInteger(record.sourceSkippedCount)
      ? record.sourceSkippedCount
      : record.skippedCount,
    duplicateCheckCompletedAt:
      typeof record.duplicateCheckCompletedAt === 'string'
        ? record.duplicateCheckCompletedAt
        : null,
  }
}

function normalizeSaveItem(item: SaveContactItem): SaveContactItem {
  return {
    ...item,
    skipReason: item.skipReason ?? null,
  }
}

function toSessionRecord(session: SaveSession): SaveSessionRecord {
  const { items: _items, resourceNames: _resourceNames, ...record } = session
  return record
}

function buildSession(record: SaveSessionRecord, items: SaveContactItem[]): SaveSession {
  const normalizedRecord = normalizeSessionRecord(record)
  const orderedItems = items
    .map(normalizeSaveItem)
    .sort((first, second) => first.sequence - second.sequence)

  return {
    ...normalizedRecord,
    items: orderedItems,
    resourceNames: orderedItems.flatMap((item) => (
      item.status === 'saved' && item.resourceName ? [item.resourceName] : []
    )),
  }
}

function cloneSession(session: SaveSession): SaveSession {
  return {
    ...session,
    items: session.items.map((item) => ({ ...item })),
    resourceNames: [...session.resourceNames],
  }
}

export function isAccountSpecificSaveSession(session: SaveSessionRecord): boolean {
  return (
    session.schemaVersion === 2
    && Boolean(session.destinationAccountId)
    && Boolean(session.destinationEmail)
  )
}

function refreshSessionCounts(session: SaveSession): void {
  session.successCount = session.items.filter((item) => item.status === 'saved').length
  session.failedCount = session.items.filter((item) => item.status === 'failed').length
  session.skippedCount = session.sourceSkippedCount
    + session.items.filter((item) => item.status === 'skipped').length
  session.resourceNames = session.items.flatMap((item) => (
    item.status === 'saved' && item.resourceName ? [item.resourceName] : []
  ))
  session.updatedAt = new Date().toISOString()
}

async function persistSession(session: SaveSession): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(SESSION_STORE, 'readwrite')
  transaction.objectStore(SESSION_STORE).put(toSessionRecord(session))
  await transactionComplete(transaction)
}

async function persistItemAndSession(
  item: SaveContactItem,
  session: SaveSession,
): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction([SESSION_STORE, ITEM_STORE], 'readwrite')
  transaction.objectStore(ITEM_STORE).put(item)
  transaction.objectStore(SESSION_STORE).put(toSessionRecord(session))
  await transactionComplete(transaction)
}

async function persistItemsAndSession(session: SaveSession): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction([SESSION_STORE, ITEM_STORE], 'readwrite')
  const itemStore = transaction.objectStore(ITEM_STORE)

  transaction.objectStore(SESSION_STORE).put(toSessionRecord(session))
  session.items.forEach((item) => itemStore.put(item))
  await transactionComplete(transaction)
}

function notifyListeners(run: ActiveSaveRun, session: SaveSession): void {
  const snapshot = cloneSession(session)
  run.listeners.forEach((listener) => listener(snapshot))
}

function getReadableContactError(error: unknown): string {
  if (error instanceof TypeError) {
    return 'The contact result is uncertain because the network request failed. Retry will check Google Contacts before sending it again.'
  }

  if (error instanceof GoogleContactsRequestError) {
    return `${error.message} It was not retried automatically.`
  }

  if (error instanceof Error && error.message) {
    return `${error.message} It was not retried automatically.`
  }

  return 'Google could not save this contact. It was not retried automatically.'
}

async function pauseSession(
  session: SaveSession,
  run: ActiveSaveRun,
  reason: string,
): Promise<SaveSession> {
  session.status = 'paused'
  session.pauseReason = reason
  refreshSessionCounts(session)
  await persistSession(session)
  notifyListeners(run, session)
  return session
}

async function executeSaveQueue(
  sessionId: string,
  run: ActiveSaveRun,
): Promise<SaveSession> {
  const session = await getSaveSession(sessionId)

  if (!session) {
    throw new Error('This save session could not be found.')
  }

  if (!isAccountSpecificSaveSession(session)) {
    throw new Error('This older save session has no verified Google destination and cannot be resumed.')
  }

  const accountId = session.destinationAccountId
  const destinationEmail = session.destinationEmail
  const hasPendingContacts = session.items.some((item) => item.status === 'pending')

  if (!hasPendingContacts) {
    return session
  }

  if (!accountId || !destinationEmail || !isGoogleAccountAuthorized(accountId)) {
    return pauseSession(
      session,
      run,
      `Reauthorize ${destinationEmail ?? 'the destination account'} before continuing.`,
    )
  }

  session.status = 'checking'
  session.pauseReason = null
  refreshSessionCounts(session)
  await persistSession(session)
  notifyListeners(run, session)

  let existingNumbers: Map<string, string | null>

  try {
    existingNumbers = await listExistingGooglePhoneNumbers(accountId)
  } catch (error) {
    const reason = error instanceof Error
      ? error.message
      : 'The existing-contact check failed.'

    return pauseSession(
      session,
      run,
      `${reason} No contacts were created for ${destinationEmail}.`,
    )
  }

  session.items.forEach((item) => {
    if (item.status === 'pending' && existingNumbers.has(item.normalizedPhone)) {
      item.status = 'skipped'
      item.skipReason = 'existing_google_contact'
      item.resourceName = null
      item.error = null
    }
  })

  session.duplicateCheckCompletedAt = new Date().toISOString()
  session.status = 'saving'
  refreshSessionCounts(session)
  await persistItemsAndSession(session)
  notifyListeners(run, session)

  for (const item of session.items) {
    if (item.status !== 'pending') {
      continue
    }

    item.attempts += 1
    await persistItemAndSession(item, session)

    try {
      item.resourceName = await createGoogleContact(accountId, {
        displayName: item.saveDisplayName,
        phone: item.normalizedPhone,
      })
      item.status = 'saved'
      item.skipReason = null
      item.error = null
    } catch (error) {
      if (error instanceof GoogleAuthorizationError) {
        await persistItemAndSession(item, session)
        return pauseSession(session, run, error.message)
      }

      item.status = 'failed'
      item.resourceName = null
      item.skipReason = null
      item.error = getReadableContactError(error)
    }

    refreshSessionCounts(session)
    await persistItemAndSession(item, session)
    notifyListeners(run, session)
  }

  refreshSessionCounts(session)
  session.completedAt = new Date().toISOString()
  session.pauseReason = null

  if (session.failedCount === 0) {
    session.status = 'completed'
  } else if (
    session.successCount > 0
    || session.items.some((item) => item.status === 'skipped')
  ) {
    session.status = 'partial'
  } else {
    session.status = 'failed'
  }

  await persistSession(session)
  notifyListeners(run, session)
  return session
}

export async function createSaveSession(
  sourceFileName: string,
  contacts: ProcessedContact[],
  destinationAccountId: string,
): Promise<SaveSession> {
  const destinationAccount = getGoogleAccount(destinationAccountId)

  if (!destinationAccount || destinationAccount.status !== 'connected') {
    throw new Error('The selected Google account must be reauthorized before saving.')
  }

  const eligibleContacts = contacts.filter((contact) => (
    contact.status === 'new'
    && contact.isValid
    && Boolean(contact.normalizedPhone)
    && Boolean(contact.saveDisplayName)
  ))
  const now = new Date().toISOString()
  const sessionId = crypto.randomUUID()

  const items: SaveContactItem[] = eligibleContacts.map((contact, index) => ({
    key: `${sessionId}:${contact.id}`,
    sessionId,
    contactId: contact.id,
    sequence: index + 1,
    originalName: contact.originalName,
    saveDisplayName: contact.saveDisplayName ?? contact.name,
    normalizedPhone: contact.normalizedPhone,
    status: 'pending',
    resourceName: null,
    skipReason: null,
    error: null,
    attempts: 0,
  }))

  const sourceSkippedCount = contacts.length - items.length
  const session: SaveSession = {
    schemaVersion: 2,
    id: sessionId,
    destinationAccountId: destinationAccount.id,
    destinationEmail: destinationAccount.email,
    sourceFileName,
    startedAt: now,
    updatedAt: now,
    completedAt: items.length === 0 ? now : null,
    totalNewContacts: items.length,
    successCount: 0,
    failedCount: 0,
    sourceSkippedCount,
    skippedCount: sourceSkippedCount,
    duplicateCheckCompletedAt: null,
    status: items.length === 0 ? 'completed' : 'checking',
    pauseReason: null,
    items,
    resourceNames: [],
  }

  await persistItemsAndSession(session)
  writeStorage(CURRENT_SESSION_KEY, session.id)
  return cloneSession(session)
}

export async function getSaveSession(sessionId: string): Promise<SaveSession | null> {
  const database = await openDatabase()
  const transaction = database.transaction([SESSION_STORE, ITEM_STORE], 'readonly')
  const completed = transactionComplete(transaction)
  const recordRequest = transaction.objectStore(SESSION_STORE).get(sessionId)
  const itemRequest = transaction
    .objectStore(ITEM_STORE)
    .index(SESSION_INDEX)
    .getAll(sessionId)

  const [record, items] = await Promise.all([
    requestResult(recordRequest) as Promise<SaveSessionRecord | undefined>,
    requestResult(itemRequest) as Promise<SaveContactItem[]>,
  ])

  await completed
  return record ? buildSession(record, items) : null
}

export async function getCurrentSaveSession(): Promise<SaveSession | null> {
  const sessionId = readStorage<string | null>(CURRENT_SESSION_KEY, null)
  return sessionId ? getSaveSession(sessionId) : null
}

export async function listSaveSessions(): Promise<SaveSessionRecord[]> {
  const database = await openDatabase()
  const transaction = database.transaction(SESSION_STORE, 'readonly')
  const completed = transactionComplete(transaction)
  const records = await requestResult(
    transaction.objectStore(SESSION_STORE).getAll(),
  ) as SaveSessionRecord[]

  await completed
  return records
    .map(normalizeSessionRecord)
    .sort((first, second) => second.startedAt.localeCompare(first.startedAt))
}

export async function runSaveQueue(
  sessionId: string,
  listener?: SaveProgressListener,
): Promise<SaveSession> {
  const session = await getSaveSession(sessionId)

  if (!session) {
    throw new Error('This save session could not be found.')
  }

  if (!isAccountSpecificSaveSession(session)) {
    throw new Error('This older save session has no verified Google destination and cannot be resumed.')
  }

  const existingRun = activeSaveRuns.get(sessionId)

  if (existingRun?.promise) {
    if (listener) {
      existingRun.listeners.add(listener)
    }

    try {
      return await existingRun.promise
    } finally {
      if (listener) {
        existingRun.listeners.delete(listener)
      }
    }
  }

  const run: ActiveSaveRun = {
    promise: null,
    listeners: new Set(listener ? [listener] : []),
  }

  activeSaveRuns.set(sessionId, run)
  run.promise = executeSaveQueue(sessionId, run).finally(() => {
    if (activeSaveRuns.get(sessionId) === run) {
      activeSaveRuns.delete(sessionId)
    }
  })

  try {
    return await run.promise
  } finally {
    if (listener) {
      run.listeners.delete(listener)
    }
  }
}

export async function prepareFailedContactsForRetry(
  sessionId: string,
): Promise<SaveSession> {
  const session = await getSaveSession(sessionId)

  if (!session) {
    throw new Error('This save session could not be found.')
  }

  if (!isAccountSpecificSaveSession(session)) {
    throw new Error('This older save session has no verified Google destination and cannot be retried.')
  }

  session.items.forEach((item) => {
    if (item.status === 'failed') {
      item.status = 'pending'
      item.resourceName = null
      item.skipReason = null
      item.error = null
    }
  })

  session.status = 'paused'
  session.pauseReason = 'Failed contacts are ready for a fresh duplicate check before retrying.'
  session.completedAt = null
  session.duplicateCheckCompletedAt = null
  refreshSessionCounts(session)
  await persistItemsAndSession(session)
  writeStorage(CURRENT_SESSION_KEY, session.id)
  return cloneSession(session)
}
