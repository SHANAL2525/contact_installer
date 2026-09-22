import { NavLink, Outlet } from 'react-router-dom'
import { useAppAuth } from '../hooks/useAppAuth'

const navigation = [
  { label: 'Home', path: '/' },
  { label: 'Import', path: '/import' },
  { label: 'Contacts', path: '/contacts' },
  { label: 'Accounts', path: '/accounts' },
  { label: 'History', path: '/history' },
]

function PrimaryNavigation({ showOfficeUsers = false }: { showOfficeUsers?: boolean }) {
  const items = showOfficeUsers
    ? [...navigation, { label: 'Office Users', path: '/office-users' }]
    : navigation

  return (
    <nav
      className={showOfficeUsers ? 'app-nav app-nav-owner' : 'app-nav'}
      aria-label="Primary navigation"
    >
      {items.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

function AuthenticatedNavigation() {
  const { session } = useAppAuth()
  return <PrimaryNavigation showOfficeUsers={session?.user.role === 'owner'} />
}

interface AppShellProps {
  showApplicationIdentity?: boolean
}

function ApplicationIdentityControls() {
  const { session, logout } = useAppAuth()

  return (
    <div className="app-user">
      <span>
        <strong>{session?.user.displayName || 'Signed in'}</strong>
        <small>{session?.user.email}</small>
      </span>
      <button className="text-action" type="button" onClick={() => void logout()}>
        Sign out
      </button>
    </div>
  )
}

export function AppShell({ showApplicationIdentity = true }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink className="brand" to="/" aria-label="Contact Auto Save home">
          <span className="brand-mark" aria-hidden="true">CA</span>
          <span className="brand-copy">
            <strong>Contact Auto Save</strong>
            <small>Import. Review. Save.</small>
          </span>
        </NavLink>
        {showApplicationIdentity && <ApplicationIdentityControls />}
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      {showApplicationIdentity ? <AuthenticatedNavigation /> : <PrimaryNavigation />}
    </div>
  )
}
