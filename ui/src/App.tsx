import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import ProtectedRoute from './components/ProtectedRoute'
import PublicRoute from './components/PublicRoute'
import Spinner from './components/Spinner'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import { useEffect, useState } from 'react'

const SLOW_THRESHOLD_MS = 5_000   // show a warning after 5 s

function AppRoutes() {
  const { isInitialized } = useAuth()
  const [slow, setSlow] = useState(false)

  // If the auth check takes longer than SLOW_THRESHOLD_MS, tell the user.
  useEffect(() => {
    if (isInitialized) return
    const id = setTimeout(() => setSlow(true), SLOW_THRESHOLD_MS)
    return () => clearTimeout(id)
  }, [isInitialized])

  if (!isInitialized) {
    return (
      <Spinner
        message={
          slow
            ? 'Still connecting to the server… make sure the backend is running.'
            : undefined
        }
      />
    )
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      {/* Catch-all: unknown paths go to dashboard; ProtectedRoute handles the auth redirect. */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}