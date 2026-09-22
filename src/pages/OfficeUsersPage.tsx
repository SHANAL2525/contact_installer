import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAppAuth } from '../hooks/useAppAuth'
import {
  inviteOfficeUser,
  listOfficeUsers,
  revokeOfficeUser,
  type OfficeUser,
} from '../services/officeUsersService'

export function OfficeUsersPage() {
  const { session } = useAppAuth()
  const [users, setUsers] = useState<OfficeUser[]>([])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      setUsers(await listOfficeUsers())
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to load office users.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (session?.user.role !== 'owner') {
      return
    }

    let active = true

    listOfficeUsers()
      .then((nextUsers) => {
        if (active) {
          setUsers(nextUsers)
        }
      })
      .catch((nextError: unknown) => {
        if (active) {
          setError(nextError instanceof Error ? nextError.message : 'Unable to load office users.')
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [session?.user.role])

  if (!session || session.user.role !== 'owner') {
    return <Navigate to="/" replace />
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setMessage(null)

    try {
      await inviteOfficeUser(email, session!.csrfToken)
      setEmail('')
      setMessage('Invitation saved. Access will bind to the verified Google account at first login.')
      await loadUsers()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to invite this account.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRevoke(user: OfficeUser) {
    if (!window.confirm(`Revoke office access for ${user.email}?`)) {
      return
    }

    setPendingId(user.id)
    setError(null)
    setMessage(null)

    try {
      await revokeOfficeUser(user.id, session!.csrfToken)
      setMessage(`Access revoked for ${user.email}.`)
      await loadUsers()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to revoke this account.')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <section className="screen office-users-screen">
      <p className="eyebrow">Owner controls</p>
      <h1>Office users</h1>
      <p className="lede">
        Invite individual Google accounts and revoke access without giving staff Cloudflare or Google Cloud administration rights.
      </p>

      <form className="office-invite-form" onSubmit={(event) => void handleInvite(event)}>
        <label htmlFor="office-user-email">Staff Google account</label>
        <div>
          <input
            id="office-user-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="staff@example.com"
            required
            disabled={submitting}
          />
          <button className="button primary" type="submit" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add staff'}
          </button>
        </div>
        <small>The invitation is bound to Google’s verified immutable identity at first login.</small>
      </form>

      {error && <p className="import-error" role="alert">{error}</p>}
      {message && <p className="office-success" role="status">{message}</p>}

      <div className="office-user-list" aria-live="polite">
        {loading ? (
          <p className="lede">Loading office users…</p>
        ) : users.length === 0 ? (
          <p className="lede">No office users are configured.</p>
        ) : users.map((user) => (
          <article className="office-user-card" key={user.id}>
            <div>
              <span className={`office-status office-status-${user.status}`}>{user.status}</span>
              <h2>{user.displayName || user.email}</h2>
              {user.displayName && <p>{user.email}</p>}
              <small>{user.role === 'owner' ? 'Owner' : 'Staff'}</small>
            </div>
            {user.status !== 'revoked' && !user.isCurrentUser && (
              <button
                className="text-action danger"
                type="button"
                disabled={pendingId === user.id}
                onClick={() => void handleRevoke(user)}
              >
                {pendingId === user.id ? 'Revoking…' : 'Revoke access'}
              </button>
            )}
          </article>
        ))}
      </div>

      <div className="phase-safety-note" role="note">
        <strong>Local history reminder</strong>
        <p>Each staff member must use a separate browser profile. Existing IndexedDB history is preserved and is not reassigned to newly signed-in users.</p>
      </div>
    </section>
  )
}
