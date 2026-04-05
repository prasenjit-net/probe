import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import {
  LayoutDashboard, Link2, ClipboardList, PlayCircle,
  BarChart2, LogOut, Sun, Moon, Menu, X, Zap, FileJson, Archive,
} from 'lucide-react'

interface LayoutProps { children: ReactNode }

const navItems = [
  { to: '/dashboard',   label: 'Dashboard',      icon: LayoutDashboard, end: true },
  { to: '/requests',    label: 'Requests',        icon: Link2 },
  { to: '/test-plans',  label: 'Test Plans',      icon: ClipboardList },
  { to: '/executions',  label: 'Executions',      icon: PlayCircle },
  { to: '/reports',     label: 'Reports',         icon: BarChart2 },
  { to: '/specs',       label: 'API Specs',       icon: FileJson },
  { to: '/archive',     label: 'Archives',        icon: Archive },
]

function UserAvatar({ name }: { name: string }) {
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm select-none">
      {name.slice(0, 2).toUpperCase()}
    </div>
  )
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="w-[220px] h-full flex flex-col bg-white dark:bg-gray-950 border-r border-gray-100 dark:border-gray-800/80">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 px-4 border-b border-gray-100 dark:border-gray-800/80">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm shrink-0">
          <Zap className="w-[14px] h-[14px] text-white" strokeWidth={2.5} />
        </div>
        <span className="font-bold text-[15px] tracking-tight text-gray-900 dark:text-white">Probe</span>
        <span className="ml-auto font-mono text-[9px] font-medium text-gray-400 dark:text-gray-600 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-md">
          v1.0
        </span>
        {onClose && (
          <button onClick={onClose} className="md:hidden ml-1 p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600">
          Navigation
        </p>
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            className={({ isActive }) =>
              `group flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13px] font-medium transition-all duration-100 ${
                isActive
                  ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/60 hover:text-gray-900 dark:hover:text-gray-200'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={`w-[15px] h-[15px] shrink-0 ${
                    isActive
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300'
                  }`}
                  strokeWidth={isActive ? 2.25 : 1.75}
                />
                <span>{label}</span>
                {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 shrink-0" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-100 dark:border-gray-800/80 p-2 space-y-0.5">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13px] font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/60 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
        >
          {theme === 'light'
            ? <Moon className="w-[15px] h-[15px] text-gray-400 shrink-0" strokeWidth={1.75} />
            : <Sun className="w-[15px] h-[15px] text-gray-400 shrink-0" strokeWidth={1.75} />
          }
          {theme === 'light' ? 'Dark mode' : 'Light mode'}
        </button>

        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg">
          {user && <UserAvatar name={user} />}
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 truncate">{user}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">Administrator</p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden animate-fade-in">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-50 animate-slide-in">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header className="md:hidden h-14 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800/80 flex items-center px-4 gap-3 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-gray-900 dark:text-white">Probe</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}


