import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listSaveSessions } from '../services/saveSessionService'
import type { SaveSessionRecord, SaveSessionStatus } from '../types/saveSession'

const statusLabels: Record<SaveSessionStatus, string> = {
  checking: 'Checking',
  saving: 'Saving',
  paused: 'Paused',
  completed: 'Completed',
  partial: 'Partial',
  failed: 'Failed',
}

function formatSessionDate(dateValue: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateValue))
}

export function HistoryPage() {
  const [sessions, setSessions] = useState<SaveSessionRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pageError, setPageError] = useState('')

  useEffect(() => {
    let cancelled = false

    listSaveSessions()
      .then((savedSessions) => {
        if (!cancelled) {
          setSessions(savedSessions)
          setIsLoading(false)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPageError(
            error instanceof Error ? error.message : 'Unable to load import history.',
          )
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="screen">
      <div className="page-intro compact">
        <p className="eyebrow">Activity</p>
        <h1>Import history</h1>
        <p className="lede">Previous contact imports and save results will appear here.</p>
      </div>

      {isLoading ? (
        <div className="empty-state">
          <h2>Loading history</h2>
          <p>Reading saved import sessions…</p>
        </div>
      ) : pageError ? (
        <div className="empty-state">
          <h2>History unavailable</h2>
          <p>{pageError}</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon" aria-hidden="true">↺</span>
          <h2>No import history</h2>
          <p>Complete your first import to create a history record.</p>
          <Link className="button primary" to="/">Import a file</Link>
        </div>
      ) : (
        <div className="history-list">
          {sessions.map((session) => (
            <Link
              className="history-card"
              key={session.id}
              to={['checking', 'saving', 'paused'].includes(session.status)
                ? `/saving?sessionId=${encodeURIComponent(session.id)}`
                : `/success?sessionId=${encodeURIComponent(session.id)}`}
            >
              <div className="history-card-heading">
                <div>
                  <h2>{session.sourceFileName}</h2>
                  <span>{formatSessionDate(session.startedAt)}</span>
                  {session.destinationEmail && <span>{session.destinationEmail}</span>}
                  {!session.destinationEmail && <span>Legacy session — destination unavailable</span>}
                </div>
                <span className={`history-status history-${session.status}`}>
                  {statusLabels[session.status]}
                </span>
              </div>
              <dl className="history-counts">
                <div><dt>Saved</dt><dd>{session.successCount}</dd></div>
                <div><dt>Skipped</dt><dd>{session.skippedCount}</dd></div>
                <div><dt>Failed</dt><dd>{session.failedCount}</dd></div>
              </dl>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
