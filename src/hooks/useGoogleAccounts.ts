import { useEffect, useState } from 'react'
import {
  getGoogleAccounts,
  subscribeToGoogleAccounts,
  type GoogleAccount,
} from '../services/googleAuthService'

export function useGoogleAccounts(): GoogleAccount[] {
  const [accounts, setAccounts] = useState<GoogleAccount[]>(getGoogleAccounts)

  useEffect(() => subscribeToGoogleAccounts(() => {
    setAccounts(getGoogleAccounts())
  }), [])

  return accounts
}
