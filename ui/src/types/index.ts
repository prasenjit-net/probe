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
  input_variables: InputVariable[]
  extract_variables: ExtractVariable[]
  collection_id?: string
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
  collection_id?: string
  created_at: string
  updated_at: string
}

// ── Variable System ───────────────────────────────────────────────────────────

export interface InputVariable {
  name: string
  description: string
  default_value?: string
}

export type VariableSource = 'response_body' | 'response_header' | 'status_code'

export interface ExtractVariable {
  var_name: string
  path: string
  source: VariableSource
}

export type MappingSourceKind = 'constant' | 'step_output'

export interface MappingSourceConstant {
  kind: 'constant'
  value: string
}

export interface MappingSourceStepOutput {
  kind: 'step_output'
  step_id: string
  step_name: string
  var_name: string
}

export type MappingSource = MappingSourceConstant | MappingSourceStepOutput

export interface VariableMapping {
  var_name: string
  source: MappingSource
}

export interface ResolvedVariable {
  name: string
  value?: string
  source_label: string
}

export interface TestPlanStep {
  id: string
  request: HttpRequest
  name: string
  enabled: boolean
  variable_mappings: VariableMapping[]
}

export type TestPlanStepEnriched = TestPlanStep

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
  collection_id?: string
  steps: TestPlanStepEnriched[]
  created_at: string
  updated_at: string
}

export interface TestPlanSummary {
  id: string
  name: string
  description: string
  step_count: number
  collection_id?: string
  created_at: string
  updated_at: string
}

// ── Executions ────────────────────────────────────────────────────────────────

export type ExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type ExecutionMode = 'standard' | 'load_test'

export interface LoadTestConfig {
  concurrency: number
  duration_seconds?: number
  total_iterations?: number
  ramp_up_seconds?: number
}

export interface Execution {
  id: string
  test_plan_id: string
  test_plan_name: string
  status: ExecutionStatus
  mode: ExecutionMode
  scheduled_at?: string
  created_at: string
  started_at?: string
  completed_at?: string
  report_id?: string
  environment_id?: string
  environment_name?: string
  load_test_config?: LoadTestConfig
}

// ── Environment ───────────────────────────────────────────────────────────────

export interface Environment {
  id: string
  name: string
  description: string
  variables: Record<string, string>
  created_at: string
  updated_at: string
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
  input_variables: ResolvedVariable[]
  output_variables: ResolvedVariable[]
}

export interface ExecutionReport {
  id: string
  execution_id: string
  test_plan_id: string
  test_plan_name: string
  overall_status: OverallStatus
  execution_mode: ExecutionMode
  started_at: string
  completed_at: string
  duration_ms: number
  total_steps: number
  passed_steps: number
  failed_steps: number
  step_results: StepResult[]
  collection_id?: string
  ai_summary?: string
  load_test_summary?: LoadTestSummary
}

export interface ReportSummary {
  id: string
  execution_id: string
  test_plan_id: string
  test_plan_name: string
  overall_status: OverallStatus
  execution_mode: ExecutionMode
  started_at: string
  completed_at: string
  duration_ms: number
  total_steps: number
  passed_steps: number
  failed_steps: number
  collection_id?: string
  load_test_total_iterations?: number
  load_test_concurrency?: number
}

export interface LoadTestStepSummary {
  step_id: string
  step_name: string
  total_requests: number
  passed_requests: number
  failed_requests: number
  avg_duration_ms: number
  min_duration_ms: number
  max_duration_ms: number
  p95_duration_ms: number
}

export interface LoadTestErrorSummary {
  step_id: string
  step_name: string
  error: string
  count: number
}

export interface LoadTestIterationSample {
  iteration: number
  passed: boolean
  duration_ms: number
  step_results: StepResult[]
}

export interface LoadTestSummary {
  config: LoadTestConfig
  total_iterations: number
  successful_iterations: number
  failed_iterations: number
  total_requests: number
  cancelled: boolean
  avg_iteration_duration_ms: number
  p95_iteration_duration_ms: number
  throughput_iterations_per_sec: number
  throughput_requests_per_sec: number
  per_step: LoadTestStepSummary[]
  error_counts: LoadTestErrorSummary[]
  sampled_iterations: LoadTestIterationSample[]
}

// ── API Specifications ─────────────────────────────────────────────────────────

export interface SpecSummary {
  id: string
  name: string
  created_at: string
  endpoint_count: number
}

export interface SpecRecord extends SpecSummary {
  content: Record<string, unknown>
}

// ── Generation preview ─────────────────────────────────────────────────────────

export type MappingSourcePreview =
  | { kind: 'constant'; value: string }
  | { kind: 'step_output'; step_index: number; var_name: string }

export interface VarMappingPreview {
  var_name: string
  source: MappingSourcePreview
}

export interface PlanStepPreview {
  request_name: string
  step_name: string
  variable_mappings: VarMappingPreview[]
}

export interface GeneratedRequest {
  name: string
  description: string
  method: HttpMethod
  url: string
  headers: KeyValue[]
  body?: string
  body_type: BodyType
  assertions: Assertion[]
  input_variables: InputVariable[]
  extract_variables: ExtractVariable[]
}

export interface GenerationPreview {
  spec_id: string
  base_url?: string
  requests: GeneratedRequest[]
  plan_name: string
  plan_description: string
  plan_steps: PlanStepPreview[]
}

export interface ImportResult {
  requests_created: number
  test_plan_id: string
  test_plan_name: string
  collection_id?: string
  collection_name?: string
  environment_id?: string
  environment_name?: string
  base_url?: string
}

// ── Collections ───────────────────────────────────────────────────────────────

export interface Collection {
  id: string
  name: string
  description: string
  color: string
  kind: 'request' | 'plan'
  created_at: string
  updated_at: string
}

export type CollectionSummary = Collection
