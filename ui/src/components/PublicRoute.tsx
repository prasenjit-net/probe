import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Wraps a route that should only be reachable when the user is NOT
 * authenticated (e.g. the login page).
 * If a session is already active the user is redirected to /dashboard.
 */
export default function PublicRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return user ? <Navigate to="/dashboard" replace /> : <>{children}</>
}
