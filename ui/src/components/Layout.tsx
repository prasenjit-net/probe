import { type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ThemeToggle from './ThemeToggle'

interface LayoutProps {
  children: ReactNode
}

const navItems = [
  { to: '/dashboard', label: '⬡ Dashboard', end: true },
  { to: '/requests', label: '🔗 Requests' },
  { to: '/test-plans', label: '📋 Test Plans' },
  { to: '/executions', label: '▶ Executions' },
  { to: '/reports', label: '📊 Reports' },
]

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 bg-white dark:bg-gray-800 shadow-md flex flex-col">
        {/* Brand */}
        <div className="flex h-14 items-center px-5 border-b border-gray-200 dark:border-gray-700">
          <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">⬡ Probe</span>
        </div>
        {/* Nav links */}
        <nav className="flex-1 py-4 px-2 space-y-1">
          {navItems.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        {/* User info + logout */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 space-y-2">
          {user && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user}</p>
          )}
          <button
            onClick={handleLogout}
            className="w-full rounded-md bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 transition-colors"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-white dark:bg-gray-800 shadow flex items-center justify-end px-6 gap-3 shrink-0">
          <ThemeToggle />
        </header>
        {/* Page content */}
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

