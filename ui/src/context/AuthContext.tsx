import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import type { MeData } from '../types'

interface AuthContextType {
  /** Currently authenticated username, or null when logged out. */
  user: string | null
  /** True once the initial /api/auth/me check has completed (success or 401). */
  isInitialized: boolean
  /** True while a login / logout request is in-flight. */
  isLoading: boolean
  login: (username: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // ── Restore session from the browser cookie on first mount ──────────────
  // Runs exactly once per page load → single /api/auth/me call.
  // An AbortController + 10 s timeout ensures we never hang on the Spinner
  // even if the server is unreachable.
  useEffect(() => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10_000)

    api
      .get<MeData>('/auth/me', { signal: controller.signal })
      .then(res => {
        if (res.data.authenticated && res.data.username) {
          setUser(res.data.username)
        }
      })
      .catch(() => {
        // 401 (not authenticated) or network/timeout error — both are fine.
        // isInitialized is set in finally() regardless.
      })
      .finally(() => {
        clearTimeout(timeoutId)
        setIsInitialized(true)
      })

    return () => {
      controller.abort()
      clearTimeout(timeoutId)
    }
  }, [])

  const login = async (username: string, password: string): Promise<boolean> => {
    setIsLoading(true)
    try {
      const res = await api.post<{ success: boolean }>('/auth/login', {
        username,
        password,
      })
      if (res.data.success) {
        setUser(username)
        return true
      }
    } catch {
      // Caller surfaces the error message.
    } finally {
      setIsLoading(false)
    }
    return false
  }

  const logout = async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider value={{ user, isInitialized, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}