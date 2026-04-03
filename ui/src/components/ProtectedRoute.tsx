import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Wraps a route so it is only reachable when a session is active.
 * Redirects to /login otherwise.
 *
 * NOTE: This component no longer makes its own /api/auth/me call.
 * The session check is centralised in AuthContext (runs once on app start),
 * so by the time any route renders the `user` value is already accurate.
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return user ? <>{children}</> : <Navigate to="/login" replace />
}