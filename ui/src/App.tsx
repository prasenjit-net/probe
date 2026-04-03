import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import ProtectedRoute from './components/ProtectedRoute'
import PublicRoute from './components/PublicRoute'
import Spinner from './components/Spinner'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import RequestList from './pages/requests/RequestList'
import RequestDesigner from './pages/requests/RequestDesigner'
import TestPlanList from './pages/plans/TestPlanList'
import TestPlanDesigner from './pages/plans/TestPlanDesigner'
import ExecutionQueue from './pages/executions/ExecutionQueue'
import ReportList from './pages/reports/ReportList'
import ReportDetail from './pages/reports/ReportDetail'
import { useEffect, useState } from 'react'

const SLOW_THRESHOLD_MS = 5_000

function AppRoutes() {
  const { isInitialized } = useAuth()
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (isInitialized) return
    const id = setTimeout(() => setSlow(true), SLOW_THRESHOLD_MS)
    return () => clearTimeout(id)
  }, [isInitialized])

  if (!isInitialized) {
    return (
      <Spinner
        message={slow ? 'Still connecting to the server… make sure the backend is running.' : undefined}
      />
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/requests" element={<ProtectedRoute><RequestList /></ProtectedRoute>} />
      <Route path="/requests/new" element={<ProtectedRoute><RequestDesigner /></ProtectedRoute>} />
      <Route path="/requests/:id/edit" element={<ProtectedRoute><RequestDesigner /></ProtectedRoute>} />
      <Route path="/test-plans" element={<ProtectedRoute><TestPlanList /></ProtectedRoute>} />
      <Route path="/test-plans/new" element={<ProtectedRoute><TestPlanDesigner /></ProtectedRoute>} />
      <Route path="/test-plans/:id/edit" element={<ProtectedRoute><TestPlanDesigner /></ProtectedRoute>} />
      <Route path="/executions" element={<ProtectedRoute><ExecutionQueue /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><ReportList /></ProtectedRoute>} />
      <Route path="/reports/:id" element={<ProtectedRoute><ReportDetail /></ProtectedRoute>} />
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