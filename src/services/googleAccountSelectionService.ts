import type { GoogleAccount } from './googleAuthService'
import { readStorage, writeStorage } from '../utils/storage'

const ACCOUNT_SELECTION_STORAGE_KEY = 'selected-google-account-ids-v1'

function readSelectedAccountIds(): string[] {
  const storedValue = readStorage<unknown>(ACCOUNT_SELECTION_STORAGE_KEY, [])

  if (!Array.isArray(storedValue)) {
    return []
  }

  return Array.from(new Set(
    storedValue.filter((value): value is string => typeof value === 'string' && value.length > 0),
  ))
}

export function getSelectedGoogleAccountIds(accounts: GoogleAccount[]): string[] {
  const registeredAccountIds = new Set(accounts.map((account) => account.id))
  const originalSelection = readSelectedAccountIds()
  const storedSelection = originalSelection.filter((accountId) => (
    registeredAccountIds.has(accountId)
  ))
  const connectedAccounts = accounts.filter((account) => account.status === 'connected')
  const connectedAccountIds = new Set(connectedAccounts.map((account) => account.id))
  const hasConnectedSelection = storedSelection.some((accountId) => (
    connectedAccountIds.has(accountId)
  ))
  const resolvedSelection = !hasConnectedSelection && connectedAccounts.length === 1
    ? [connectedAccounts[0].id]
    : storedSelection

  if (
    resolvedSelection.length !== originalSelection.length
    || resolvedSelection.some((accountId, index) => accountId !== originalSelection[index])
  ) {
    writeStorage(ACCOUNT_SELECTION_STORAGE_KEY, resolvedSelection)
  }

  return resolvedSelection
}

export function saveSelectedGoogleAccountIds(accountIds: string[]): string[] {
  const uniqueAccountIds = Array.from(new Set(accountIds))
  writeStorage(ACCOUNT_SELECTION_STORAGE_KEY, uniqueAccountIds)
  return uniqueAccountIds
}
