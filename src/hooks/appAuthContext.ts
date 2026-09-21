import { createContext } from 'react'
import type { AppSession } from '../services/appAuthService'

export interface AppAuthContextValue {
  session: AppSession | null
  loading: boolean
  error: string | null
  logout: () => Promise<void>
}

export const AppAuthContext = createContext<AppAuthContextValue | null>(null)
