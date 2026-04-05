import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { lazy, Suspense, useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import ProtectedRoute from './components/ProtectedRoute'
import PublicRoute from './components/PublicRoute'
import Spinner from './components/Spinner'

const Dashboard        = lazy(() => import('./pages/Dashboard'))
const Login            = lazy(() => import('./pages/Login'))
const RequestList      = lazy(() => import('./pages/requests/RequestList'))
const RequestDesigner  = lazy(() => import('./pages/requests/RequestDesigner'))
const TestPlanList     = lazy(() => import('./pages/plans/TestPlanList'))
const TestPlanDesigner = lazy(() => import('./pages/plans/TestPlanDesigner'))
const ExecutionQueue   = lazy(() => import('./pages/executions/ExecutionQueue'))
const ReportList       = lazy(() => import('./pages/reports/ReportList'))
const ReportDetail     = lazy(() => import('./pages/reports/ReportDetail'))
const SpecList         = lazy(() => import('./pages/specs/SpecList'))
const GeneratePreview  = lazy(() => import('./pages/specs/GeneratePreview'))

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
    <Suspense fallback={<Spinner />}>
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
        <Route path="/specs" element={<ProtectedRoute><SpecList /></ProtectedRoute>} />
        <Route path="/specs/:id/generate" element={<ProtectedRoute><GeneratePreview /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
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