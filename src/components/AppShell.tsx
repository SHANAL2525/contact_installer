import { NavLink, Outlet } from 'react-router-dom'

const navigation = [
  { label: 'Home', path: '/' },
  { label: 'Import', path: '/import' },
  { label: 'Contacts', path: '/contacts' },
  { label: 'History', path: '/history' },
]

export function AppShell() {
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
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <nav className="app-nav" aria-label="Primary navigation">
        {navigation.map((item) => (
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
    </div>
  )
}
