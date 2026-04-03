// ── Auth ──────────────────────────────────────────────────────────────────────

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

// ── HTTP Request Library ──────────────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
export type BodyType = 'json' | 'text' | 'form_url_encoded' | 'none'
export type AssertionType = 'status_code' | 'body_contains' | 'json_path' | 'header' | 'response_time'
export type AssertionOperator = 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'regex'

export interface KeyValue {
  key: string
  value: string
}

export interface Assertion {
  id: string
  type: AssertionType
  operator: AssertionOperator
  target?: string
  expected_value: string
}

export interface HttpRequest {
  id: string
  name: string
  description: string
  method: HttpMethod
  url: string
  headers: KeyValue[]
  body?: string
  body_type: BodyType
  assertions: Assertion[]
  created_at: string
  updated_at: string
}

export interface HttpRequestSummary {
  id: string
  name: string
  description: string
  method: HttpMethod
  url: string
  assertion_count: number
  created_at: string
  updated_at: string
}

// ── Test Plans ────────────────────────────────────────────────────────────────

export type VariableSource = 'response_body' | 'response_header' | 'status_code'

export interface ExtractVariable {
  var_name: string
  path: string
  source: VariableSource
}

export interface TestPlanStep {
  id: string
  request_id: string
  name: string
  enabled: boolean
  extract_variables: ExtractVariable[]
}

export interface TestPlanStepEnriched extends TestPlanStep {
  request?: HttpRequest
}

export interface TestPlan {
  id: string
  name: string
  description: string
  steps: TestPlanStep[]
  created_at: string
  updated_at: string
}

export interface TestPlanEnriched {
  id: string
  name: string
  description: string
  steps: TestPlanStepEnriched[]
  created_at: string
  updated_at: string
}

export interface TestPlanSummary {
  id: string
  name: string
  description: string
  step_count: number
  created_at: string
  updated_at: string
}

// ── Executions ────────────────────────────────────────────────────────────────

export type ExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface Execution {
  id: string
  test_plan_id: string
  test_plan_name: string
  status: ExecutionStatus
  scheduled_at?: string
  created_at: string
  started_at?: string
  completed_at?: string
  report_id?: string
}

// ── Reports ───────────────────────────────────────────────────────────────────

export type OverallStatus = 'passed' | 'failed'

export interface AssertionResult {
  assertion_id: string
  type: AssertionType
  operator: AssertionOperator
  target?: string
  expected: string
  actual: string
  passed: boolean
  message: string
}

export interface RequestSnapshot {
  method: string
  url: string
  headers: KeyValue[]
  body?: string
}

export interface ResponseSnapshot {
  status_code: number
  headers: KeyValue[]
  body: string
  duration_ms: number
}

export interface StepResult {
  step_id: string
  request_name: string
  request: RequestSnapshot
  response?: ResponseSnapshot
  assertion_results: AssertionResult[]
  passed: boolean
  error?: string
}

export interface ExecutionReport {
  id: string
  execution_id: string
  test_plan_id: string
  test_plan_name: string
  overall_status: OverallStatus
  started_at: string
  completed_at: string
  duration_ms: number
  total_steps: number
  passed_steps: number
  failed_steps: number
  step_results: StepResult[]
}

export interface ReportSummary {
  id: string
  execution_id: string
  test_plan_id: string
  test_plan_name: string
  overall_status: OverallStatus
  started_at: string
  completed_at: string
  duration_ms: number
  total_steps: number
  passed_steps: number
  failed_steps: number
}

