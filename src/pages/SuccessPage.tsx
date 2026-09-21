import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  getCurrentSaveSession,
  getSaveSession,
} from '../services/saveSessionService'
import type { SaveSession } from '../types/saveSession'

export function SuccessPage() {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('sessionId')
  const [session, setSession] = useState<SaveSession | null>(null)
  const [pageError, setPageError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadSession() {
      try {
        const loadedSession = sessionId
          ? await getSaveSession(sessionId)
          : await getCurrentSaveSession()

        if (!cancelled) {
          if (loadedSession) {
            setSession(loadedSession)
          } else {
            setPageError('No completed save session was found.')
          }
        }
      } catch (error) {
        if (!cancelled) {
          setPageError(
            error instanceof Error ? error.message : 'Unable to load the save summary.',
          )
        }
      }
    }

    void loadSession()
    return () => {
      cancelled = true
    }
  }, [sessionId])

  if (!session) {
    return (
      <section className="screen centered-screen">
        <p className="eyebrow">Save summary</p>
        <h1>{pageError ? 'Summary unavailable' : 'Loading summary'}</h1>
        <p className="lede">{pageError || 'Loading the latest save result…'}</p>
        <div className="page-actions centered-actions">
          <Link className="button primary" to="/">Done</Link>
        </div>
      </section>
    )
  }

  return (
    <section className="screen centered-screen">
      <span className="success-icon" aria-hidden="true">✓</span>
      <p className="eyebrow">Complete</p>
      <h1>CONTACTS SAVED</h1>
      <p className="lede">
        Google Contacts finished processing {session.sourceFileName}
        {session.destinationEmail ? ` for ${session.destinationEmail}` : ''}.
      </p>

      <div className="save-result-summary" aria-label="Save result">
        <div><span>Saved</span><strong>{session.successCount}</strong></div>
        <div><span>Skipped</span><strong>{session.skippedCount}</strong></div>
        <div><span>Failed</span><strong>{session.failedCount}</strong></div>
      </div>

      <div className="page-actions centered-actions">
        <Link className="button primary" to="/">Done</Link>
        <Link className="button secondary" to="/history">View History</Link>
        {session.failedCount > 0 && (
          <Link
            className="button secondary"
            to={`/failed?sessionId=${encodeURIComponent(session.id)}`}
          >
            View Failed Contacts
          </Link>
        )}
      </div>
    </section>
  )
}
