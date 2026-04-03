import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ThemeToggle from '../components/ThemeToggle'

/**
 * Login page.
 * - Rendered only when the user is NOT authenticated (PublicRoute guards it).
 * - On success, navigates to /dashboard.
 * - No need to self-redirect if already authenticated: PublicRoute handles that.
 */
export default function Login() {
  const { login, isLoading } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const ok = await login(username, password)
    if (ok) {
      navigate('/dashboard', { replace: true })
    } else {
      setError('Invalid username or password.')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-900 transition-colors px-4">
      {/* Theme toggle – top-right corner */}
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 p-8 shadow-lg">
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-800 dark:text-white">
          ⬡ Probe
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm
                         text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none
                         focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700
                         dark:text-white dark:placeholder-gray-500"
              placeholder="admin"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm
                         text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none
                         focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700
                         dark:text-white dark:placeholder-gray-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-md bg-red-50 dark:bg-red-900/30 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white
                       hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500
                       disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
