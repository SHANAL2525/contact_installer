import type { ProcessedContact } from '../types/contact'
import type {
  SaveContactItem,
  SaveSession,
  SaveSessionRecord,
} from '../types/saveSession'
import { readStorage, writeStorage } from '../utils/storage'
import {
  GoogleAuthorizationError,
  isGoogleContactsConnected,
} from './googleAuthService'
import {
  createGoogleContact,
  GoogleContactsRequestError,
} from './googleContactsService'

const DATABASE_NAME = 'contact-auto-save'
const DATABASE_VERSION = 1
const SESSION_STORE = 'saveSessions'
const ITEM_STORE = 'saveSessionItems'
const SESSION_INDEX = 'sessionId'
const CURRENT_SESSION_KEY = 'current-save-session-id'
const MAX_TEMPORARY_RETRIES = 3
const RETRY_DELAYS_MS = [500, 1000, 2000]

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

function toSessionRecord(session: SaveSession): SaveSessionRecord {
  const { items: _items, resourceNames: _resourceNames, ...record } = session
  return record
}

function buildSession(record: SaveSessionRecord, items: SaveContactItem[]): SaveSession {
  const orderedItems = [...items].sort((first, second) => first.sequence - second.sequence)

  return {
    ...record,
    items: orderedItems,
    resourceNames: orderedItems.flatMap((item) => (
      item.resourceName ? [item.resourceName] : []
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

function refreshSessionCounts(session: SaveSession): void {
  session.successCount = session.items.filter((item) => item.status === 'saved').length
  session.failedCount = session.items.filter((item) => item.status === 'failed').length
  session.resourceNames = session.items.flatMap((item) => (
    item.resourceName ? [item.resourceName] : []
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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function isTemporaryError(error: unknown): boolean {
  return (
    (error instanceof GoogleContactsRequestError && error.retryable)
    || error instanceof TypeError
  )
}

function getReadableContactError(error: unknown): string {
  if (error instanceof GoogleContactsRequestError) {
    return error.message
  }

  if (error instanceof TypeError) {
    return 'A network error prevented this contact from being saved.'
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Google could not save this contact.'
}

async function createContactWithRetry(
  item: SaveContactItem,
  session: SaveSession,
): Promise<string> {
  for (let retryCount = 0; retryCount <= MAX_TEMPORARY_RETRIES; retryCount += 1) {
    item.attempts += 1
    await persistItemAndSession(item, session)

    try {
      return await createGoogleContact({
        displayName: item.saveDisplayName,
        phone: item.normalizedPhone,
      })
    } catch (error) {
      if (error instanceof GoogleAuthorizationError) {
        throw error
      }

      if (!isTemporaryError(error) || retryCount === MAX_TEMPORARY_RETRIES) {
        throw error
      }

      await delay(RETRY_DELAYS_MS[retryCount] ?? RETRY_DELAYS_MS.at(-1) ?? 2000)
    }
  }

  throw new Error('Google could not save this contact after several attempts.')
}

async function executeSaveQueue(
  sessionId: string,
  run: ActiveSaveRun,
): Promise<SaveSession> {
  const session = await getSaveSession(sessionId)

  if (!session) {
    throw new Error('This save session could not be found.')
  }

  const hasPendingContacts = session.items.some((item) => item.status === 'pending')

  if (!hasPendingContacts) {
    return session
  }

  if (!isGoogleContactsConnected()) {
    session.status = 'paused'
    session.pauseReason = 'Connect your Google Contacts account before saving.'
    refreshSessionCounts(session)
    await persistSession(session)
    notifyListeners(run, session)
    return session
  }

  session.status = 'saving'
  session.pauseReason = null
  session.completedAt = null
  refreshSessionCounts(session)
  await persistSession(session)
  notifyListeners(run, session)

  for (const item of session.items) {
    if (item.status !== 'pending') {
      continue
    }

    try {
      item.resourceName = await createContactWithRetry(item, session)
      item.status = 'saved'
      item.error = null
    } catch (error) {
      if (error instanceof GoogleAuthorizationError) {
        session.status = 'paused'
        session.pauseReason = error.message
        refreshSessionCounts(session)
        await persistItemAndSession(item, session)
        notifyListeners(run, session)
        return session
      }

      item.status = 'failed'
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
  } else if (session.successCount > 0) {
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
): Promise<SaveSession> {
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
    error: null,
    attempts: 0,
  }))

  const session: SaveSession = {
    id: sessionId,
    sourceFileName,
    startedAt: now,
    updatedAt: now,
    completedAt: items.length === 0 ? now : null,
    totalNewContacts: items.length,
    successCount: 0,
    failedCount: 0,
    skippedCount: contacts.length - items.length,
    status: items.length === 0 ? 'completed' : 'saving',
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
  return records.sort((first, second) => second.startedAt.localeCompare(first.startedAt))
}

export async function runSaveQueue(
  sessionId: string,
  listener?: SaveProgressListener,
): Promise<SaveSession> {
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

  session.items.forEach((item) => {
    if (item.status === 'failed') {
      item.status = 'pending'
      item.error = null
    }
  })

  session.status = 'paused'
  session.pauseReason = 'Failed contacts are ready to retry.'
  session.completedAt = null
  refreshSessionCounts(session)
  await persistItemsAndSession(session)
  writeStorage(CURRENT_SESSION_KEY, session.id)
  return cloneSession(session)
}
