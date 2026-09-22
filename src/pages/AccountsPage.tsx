import { useState } from 'react'
import { useGoogleAccounts } from '../hooks/useGoogleAccounts'
import {
  connectGoogleAccount,
  disconnectGoogleAccount,
  reauthorizeGoogleAccount,
} from '../services/googleAuthService'

export function AccountsPage() {
  const accounts = useGoogleAccounts()
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null)
  const [isAddingAccount, setIsAddingAccount] = useState(false)
  const [pageError, setPageError] = useState('')
  const connectedCount = accounts.filter((account) => account.status === 'connected').length

  async function handleAddAccount() {
    if (isAddingAccount || pendingAccountId) {
      return
    }

    setPageError('')
    setIsAddingAccount(true)

    try {
      await connectGoogleAccount()
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : 'Unable to add this Google account. Please try again.',
      )
    } finally {
      setIsAddingAccount(false)
    }
  }

  async function handleReauthorize(accountId: string) {
    if (isAddingAccount || pendingAccountId) {
      return
    }

    setPageError('')
    setPendingAccountId(accountId)

    try {
      await reauthorizeGoogleAccount(accountId)
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : 'Unable to reauthorize this Google account.',
      )
    } finally {
      setPendingAccountId(null)
    }
  }

  async function handleDisconnect(accountId: string, email: string) {
    if (isAddingAccount || pendingAccountId) {
      return
    }

    const confirmed = window.confirm(
      `Disconnect ${email} from Contact Auto Save? No Google Contacts will be deleted.`,
    )

    if (!confirmed) {
      return
    }

    setPageError('')
    setPendingAccountId(accountId)

    try {
      await disconnectGoogleAccount(accountId)
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : 'Unable to disconnect this Google account.',
      )
    } finally {
      setPendingAccountId(null)
    }
  }

  return (
    <section className="screen accounts-screen">
      <div className="page-intro compact">
        <p className="eyebrow">Google accounts</p>
        <h1>Connected Accounts</h1>
        <p className="lede">
          Add each Gmail destination separately. Access tokens stay only in memory and expire automatically.
        </p>
      </div>

      <section className="account-overview" aria-label="Google account connection summary">
        <div>
          <span>Accounts added</span>
          <strong>{accounts.length}</strong>
        </div>
        <div>
          <span>Ready to select</span>
          <strong>{connectedCount}</strong>
        </div>
      </section>

      <button
        className="button primary add-account-button"
        type="button"
        disabled={isAddingAccount || pendingAccountId !== null}
        onClick={handleAddAccount}
      >
        {isAddingAccount ? 'Opening Google…' : 'Add Gmail Account'}
      </button>

      {pageError && <p className="import-error" role="alert">{pageError}</p>}

      {accounts.length === 0 ? (
        <div className="empty-state accounts-empty-state">
          <span className="empty-icon" aria-hidden="true">@</span>
          <h2>No Google accounts added</h2>
          <p>Add an account to make it available as a contact destination.</p>
        </div>
      ) : (
        <div className="account-list" aria-label="Connected Google accounts">
          {accounts.map((account) => {
            const isPending = pendingAccountId === account.id
            const isConnected = account.status === 'connected'

            return (
              <article className="account-card" key={account.id}>
                <div className="account-card-heading">
                  <div className="account-avatar" aria-hidden="true">
                    {account.email.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="account-identity">
                    <h2>{account.email}</h2>
                    <span className={`account-status ${isConnected ? 'connected' : 'reauthorize'}`}>
                      {isConnected ? 'Connected' : 'Authorization required'}
                    </span>
                  </div>
                </div>

                {!isConnected && (
                  <p className="account-note">
                    Tokens are never restored from storage. Reauthorize this exact account to select it.
                  </p>
                )}

                <div className="account-actions">
                  {!isConnected && (
                    <button
                      className="small-button primary"
                      type="button"
                      disabled={isPending || isAddingAccount}
                      onClick={() => handleReauthorize(account.id)}
                    >
                      {isPending ? 'Authorizing…' : 'Reauthorize'}
                    </button>
                  )}
                  <button
                    className="small-button danger"
                    type="button"
                    disabled={isPending || isAddingAccount}
                    onClick={() => handleDisconnect(account.id, account.email)}
                  >
                    {isPending ? 'Please wait…' : 'Disconnect'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <div className="phase-safety-note" role="note">
        <strong>Account-specific safety</strong>
        <p>One connected account is enough to save. Each save session remains bound to its verified destination account.</p>
      </div>
    </section>
  )
}
