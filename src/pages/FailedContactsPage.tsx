import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  getCurrentSaveSession,
  getSaveSession,
  isAccountSpecificSaveSession,
  prepareFailedContactsForRetry,
} from '../services/saveSessionService'
import type { SaveSession } from '../types/saveSession'

export function FailedContactsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('sessionId')
  const [session, setSession] = useState<SaveSession | null>(null)
  const [pageError, setPageError] = useState('')
  const [isPreparingRetry, setIsPreparingRetry] = useState(false)

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
            setPageError('No save session was found.')
          }
        }
      } catch (error) {
        if (!cancelled) {
          setPageError(
            error instanceof Error ? error.message : 'Unable to load failed contacts.',
          )
        }
      }
    }

    void loadSession()
    return () => {
      cancelled = true
    }
  }, [sessionId])

  async function handleRetryFailedContacts() {
    if (!session || isPreparingRetry || !isAccountSpecificSaveSession(session)) {
      return
    }

    setIsPreparingRetry(true)
    setPageError('')

    try {
      const retrySession = await prepareFailedContactsForRetry(session.id)
      navigate(`/saving?sessionId=${encodeURIComponent(retrySession.id)}`)
    } catch (error) {
      setIsPreparingRetry(false)
      setPageError(
        error instanceof Error ? error.message : 'Unable to prepare failed contacts.',
      )
    }
  }

  const failedContacts = session?.items.filter((item) => item.status === 'failed') ?? []
  const canRetry = Boolean(session && isAccountSpecificSaveSession(session))

  return (
    <section className="screen">
      <div className="page-intro compact">
        <p className="eyebrow">Save issues</p>
        <h1>Failed Contacts</h1>
        <p className="lede">
          {canRetry
            ? `Retrying will first check ${session?.destinationEmail} for existing phone numbers.`
            : 'Existing failed-contact details remain available, but legacy sessions cannot be retried without a verified destination.'}
        </p>
      </div>

      {pageError && <p className="import-error" role="alert">{pageError}</p>}

      {!session && !pageError ? (
        <div className="empty-state small"><p>Loading failed contacts…</p></div>
      ) : failedContacts.length === 0 ? (
        <div className="empty-state small">
          <h2>No failed contacts</h2>
          <p>There are no failed contacts remaining in this save session.</p>
        </div>
      ) : (
        <div className="failed-contact-list">
          {failedContacts.map((contact) => (
            <article className="failed-contact-card" key={contact.key}>
              <h2>{contact.saveDisplayName}</h2>
              <dl>
                <div><dt>Phone</dt><dd>{contact.normalizedPhone}</dd></div>
                <div><dt>Reason</dt><dd>{contact.error || 'Google could not save this contact.'}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      )}

      <div className="page-actions">
        <Link
          className="button secondary"
          to={session ? `/success?sessionId=${encodeURIComponent(session.id)}` : '/history'}
        >
          Back
        </Link>
        {failedContacts.length > 0 && (
          <button
            className="button primary"
            type="button"
            disabled={!canRetry || isPreparingRetry}
            onClick={handleRetryFailedContacts}
          >
            {isPreparingRetry
              ? 'Preparing Safe Retry…'
              : canRetry
                ? 'Check Duplicates & Retry'
                : 'Retry unavailable for legacy session'}
          </button>
        )}
      </div>
    </section>
  )
}
