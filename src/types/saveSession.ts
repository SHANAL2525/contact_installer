export type SaveSessionStatus =
  | 'saving'
  | 'paused'
  | 'completed'
  | 'partial'
  | 'failed'

export type SaveContactItemStatus = 'pending' | 'saved' | 'failed'

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
  error: string | null
  attempts: number
}

export type SaveSessionRecord = {
  id: string
  sourceFileName: string
  startedAt: string
  updatedAt: string
  completedAt: string | null
  totalNewContacts: number
  successCount: number
  failedCount: number
  skippedCount: number
  status: SaveSessionStatus
  pauseReason: string | null
}

export type SaveSession = SaveSessionRecord & {
  items: SaveContactItem[]
  resourceNames: string[]
}
