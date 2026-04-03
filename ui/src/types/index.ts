// ── API response shapes ────────────────────────────────────────────────────

export interface HealthData {
  status: string
  uptime_seconds: number
  timestamp: string
  app_name: string
  version: string
}

export interface MetricsData {
  requests_total: number
  login_success_total: number
  login_failure_total: number
  active_sessions: number
}

export interface MeData {
  authenticated: boolean
  username?: string
}

export interface LoginResponse {
  success: boolean
  message: string
}
