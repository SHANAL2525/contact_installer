import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  isGoogleAccountAuthorized,
  reauthorizeGoogleAccount,
} from '../services/googleAuthService'
import {
  getCurrentSaveSession,
  getSaveSession,
  isAccountSpecificSaveSession,
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
  const [isRunning, setIsRunning] = useState(false)
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
          error instanceof Error ? error.message : 'Unable to continue this save session.',
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
          setPageError('No save session is available. Preview an import before saving.')
          return
        }

        setSession(loadedSession)

        if (isAccountSpecificSaveSession(loadedSession)) {
          await startOrResumeQueue(loadedSession.id)
        }
      } catch (error) {
        if (mountedRef.current) {
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

  async function handleReauthorizeAndResume() {
    if (
      !session
      || !session.destinationAccountId
      || isConnecting
      || isRunning
    ) {
      return
    }

    setIsConnecting(true)
    setPageError('')

    try {
      await reauthorizeGoogleAccount(session.destinationAccountId)
      await startOrResumeQueue(session.id)
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : 'Unable to reauthorize the destination Google account.',
      )
    } finally {
      setIsConnecting(false)
    }
  }

  if (!session) {
    return (
      <section className="screen centered-screen">
        <p className="eyebrow">Google Contacts</p>
        <h1>{pageError ? 'Session unavailable' : 'Loading session'}</h1>
        <p className="lede">{pageError || 'Reading the saved session…'}</p>
        <div className="page-actions centered-actions">
          <Link className="button primary" to="/history">Return to history</Link>
        </div>
      </section>
    )
  }

  const accountSpecific = isAccountSpecificSaveSession(session)
  const itemSkippedCount = session.items.filter((item) => item.status === 'skipped').length
  const processedCount = session.successCount + session.failedCount + itemSkippedCount
  const progressPercent = session.totalNewContacts === 0
    ? 100
    : Math.round((processedCount / session.totalNewContacts) * 100)
  const isPaused = session.status === 'paused'
  const isChecking = session.status === 'checking'

  return (
    <section className="screen save-progress-screen">
      <div className="page-intro compact">
        <p className="eyebrow">Google Contacts</p>
        <h1>{accountSpecific ? 'Saving Contacts' : 'Saved Progress'}</h1>
        <p className="lede">
          {accountSpecific
            ? <>Destination: <strong>{session.destinationEmail}</strong></>
            : <>Existing progress for {session.sourceFileName} is preserved and remains read-only.</>}
        </p>
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
          <span>{itemSkippedCount} existing</span>
          <span>{session.failedCount} failed</span>
        </div>
      </section>

      {!accountSpecific && (
        <div className="save-paused-card" role="note">
          <h2>Resume safely disabled</h2>
          <p>This older session has no verified destination account identity. It will not be assigned to a newly connected account.</p>
          <button className="button primary" type="button" disabled>Resume unavailable</button>
        </div>
      )}

      {accountSpecific && isPaused && (
        <div className="save-paused-card" role="alert">
          <h2>Save paused</h2>
          <p>{session.pauseReason || `Reauthorize ${session.destinationEmail} to continue safely.`}</p>
          <button
            className="button primary"
            type="button"
            disabled={isConnecting || isRunning}
            onClick={handleReauthorizeAndResume}
          >
            {isConnecting
              ? 'Reauthorizing…'
              : session.destinationAccountId
                && isGoogleAccountAuthorized(session.destinationAccountId)
                ? 'Retry Duplicate Check'
                : `Reauthorize ${session.destinationEmail}`}
          </button>
        </div>
      )}

      {pageError && <p className="import-error" role="alert">{pageError}</p>}

      {accountSpecific && isRunning && (
        <p className="save-running-note" role="status">
          {isChecking
            ? `Checking existing contacts in ${session.destinationEmail}…`
            : `Creating contacts sequentially in ${session.destinationEmail}. Keep this page open.`}
        </p>
      )}

      <div className="page-actions">
        <Link className="button secondary" to="/history">View history</Link>
        <Link className="button secondary" to="/accounts">Manage accounts</Link>
      </div>
    </section>
  )
}
