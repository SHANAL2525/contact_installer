import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  connectGoogleContacts,
  isGoogleContactsConnected,
} from '../services/googleAuthService'
import {
  getCurrentSaveSession,
  getSaveSession,
  runSaveQueue,
} from '../services/saveSessionService'
import type { SaveSession } from '../types/saveSession'

export function SaveProgressPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedSessionId = searchParams.get('sessionId')
  const mountedRef = useRef(true)
  const [session, setSession] = useState<SaveSession | null>(null)
  const [pageError, setPageError] = useState('')
  const [isRunning, setIsRunning] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)

  const startOrResumeQueue = useCallback(async (sessionId: string) => {
    if (mountedRef.current) {
      setPageError('')
      setIsRunning(true)
    }

    try {
      const finalSession = await runSaveQueue(sessionId, (updatedSession) => {
        if (mountedRef.current) {
          setSession(updatedSession)
        }
      })

      if (!mountedRef.current) {
        return
      }

      setSession(finalSession)
      setIsRunning(false)

      if (['completed', 'partial', 'failed'].includes(finalSession.status)) {
        navigate(`/success?sessionId=${encodeURIComponent(finalSession.id)}`, {
          replace: true,
        })
      }
    } catch (error) {
      if (mountedRef.current) {
        setIsRunning(false)
        setPageError(
          error instanceof Error
            ? error.message
            : 'Unable to continue this save session.',
        )
      }
    }
  }, [navigate])

  useEffect(() => {
    mountedRef.current = true

    async function loadSession() {
      try {
        const loadedSession = requestedSessionId
          ? await getSaveSession(requestedSessionId)
          : await getCurrentSaveSession()

        if (!mountedRef.current) {
          return
        }

        if (!loadedSession) {
          setIsRunning(false)
          setPageError('No save session is available. Preview an import before saving.')
          return
        }

        setSession(loadedSession)
        await startOrResumeQueue(loadedSession.id)
      } catch (error) {
        if (mountedRef.current) {
          setIsRunning(false)
          setPageError(
            error instanceof Error ? error.message : 'Unable to load this save session.',
          )
        }
      }
    }

    void loadSession()

    return () => {
      mountedRef.current = false
    }
  }, [requestedSessionId, startOrResumeQueue])

  async function handleReconnectAndResume() {
    if (!session || isConnecting || isRunning) {
      return
    }

    setIsConnecting(true)
    setPageError('')

    try {
      if (!isGoogleContactsConnected()) {
        await connectGoogleContacts()
      }

      await startOrResumeQueue(session.id)
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : 'Unable to reconnect to Google Contacts.',
      )
    } finally {
      setIsConnecting(false)
    }
  }

  if (!session) {
    return (
      <section className="screen centered-screen">
        <p className="eyebrow">Google Contacts</p>
        <h1>{pageError ? 'Unable to save' : 'Loading save session'}</h1>
        <p className="lede">{pageError || 'Preparing your contacts…'}</p>
        {pageError && (
          <div className="page-actions centered-actions">
            <Link className="button primary" to="/preview">Return to preview</Link>
          </div>
        )}
      </section>
    )
  }

  const processedCount = session.successCount + session.failedCount
  const progressPercent = session.totalNewContacts === 0
    ? 100
    : Math.round((processedCount / session.totalNewContacts) * 100)
  const isPaused = session.status === 'paused'

  return (
    <section className="screen save-progress-screen">
      <div className="page-intro compact">
        <p className="eyebrow">Google Contacts</p>
        <h1>Saving Contacts</h1>
        <p className="lede">Saving new contacts from {session.sourceFileName} one at a time.</p>
      </div>

      <section className="save-progress-card" aria-live="polite">
        <div className="save-progress-count">
          <span>Saved contacts</span>
          <strong>{session.successCount} / {session.totalNewContacts}</strong>
        </div>

        <div
          className="save-progress-track"
          role="progressbar"
          aria-label="Contact save progress"
          aria-valuemin={0}
          aria-valuemax={session.totalNewContacts}
          aria-valuenow={processedCount}
        >
          <span style={{ width: `${progressPercent}%` }} />
        </div>

        <div className="save-progress-meta">
          <span>{processedCount} processed</span>
          <span>{session.failedCount} failed</span>
        </div>
      </section>

      {isPaused && (
        <div className="save-paused-card" role="alert">
          <h2>Save paused</h2>
          <p>{session.pauseReason || 'Reconnect Google Contacts to continue safely.'}</p>
          <button
            className="button primary"
            type="button"
            disabled={isConnecting || isRunning}
            onClick={handleReconnectAndResume}
          >
            {isConnecting
              ? 'Connecting…'
              : isGoogleContactsConnected()
                ? 'Resume Save'
                : 'Connect Gmail & Resume'}
          </button>
        </div>
      )}

      {pageError && <p className="import-error" role="alert">{pageError}</p>}

      {!isPaused && isRunning && (
        <p className="save-running-note" role="status">Creating contacts safely. Keep this page open.</p>
      )}

      <div className="page-actions">
        <Link className="button secondary" to="/preview">Back to preview</Link>
      </div>
    </section>
  )
}
