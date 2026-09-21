export type SaveSessionStatus =
  | 'checking'
  | 'saving'
  | 'paused'
  | 'completed'
  | 'partial'
  | 'failed'

export type SaveContactItemStatus = 'pending' | 'saved' | 'failed' | 'skipped'

export type SaveContactSkipReason = 'existing_google_contact'

export type SaveContactItem = {
  key: string
  sessionId: string
  contactId: string
  sequence: number
  originalName: string
  saveDisplayName: string
  normalizedPhone: string
  status: SaveContactItemStatus
  resourceName: string | null
  skipReason: SaveContactSkipReason | null
  error: string | null
  attempts: number
}

export type SaveSessionRecord = {
  schemaVersion: 1 | 2
  id: string
  destinationAccountId: string | null
  destinationEmail: string | null
  sourceFileName: string
  startedAt: string
  updatedAt: string
  completedAt: string | null
  totalNewContacts: number
  successCount: number
  failedCount: number
  sourceSkippedCount: number
  skippedCount: number
  duplicateCheckCompletedAt: string | null
  status: SaveSessionStatus
  pauseReason: string | null
}

export type SaveSession = SaveSessionRecord & {
  items: SaveContactItem[]
  resourceNames: string[]
}
