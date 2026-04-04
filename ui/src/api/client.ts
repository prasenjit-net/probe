import axios from 'axios'
import type {
  HttpRequest, HttpRequestSummary, Assertion, KeyValue, BodyType, HttpMethod, InputVariable,
  TestPlanSummary, TestPlanEnriched, TestPlanStep,
  Execution, ExecutionReport, ReportSummary,
  HealthData, MetricsData, MeData,
} from '../types'

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

// ── Health & Metrics ──────────────────────────────────────────────────────────
export const getHealth = () => api.get<HealthData>('/health').then(r => r.data)
export const getMetrics = () => api.get<MetricsData>('/metrics/summary').then(r => r.data)
export const getMe = () => api.get<MeData>('/auth/me').then(r => r.data)

// ── HTTP Requests ─────────────────────────────────────────────────────────────
export const listRequests = () => api.get<HttpRequestSummary[]>('/requests').then(r => r.data)
export const getRequest = (id: string) => api.get<HttpRequest>(`/requests/${id}`).then(r => r.data)
export const createRequest = (data: {
  name: string; description: string; method: HttpMethod; url: string;
  headers: KeyValue[]; body?: string; body_type: BodyType; assertions: Assertion[];
  input_variables: InputVariable[];
}) => api.post<HttpRequest>('/requests', data).then(r => r.data)
export const updateRequest = (id: string, data: {
  name: string; description: string; method: HttpMethod; url: string;
  headers: KeyValue[]; body?: string; body_type: BodyType; assertions: Assertion[];
  input_variables: InputVariable[];
}) => api.put<HttpRequest>(`/requests/${id}`, data).then(r => r.data)
export const deleteRequest = (id: string) => api.delete(`/requests/${id}`)

// ── Test Plans ────────────────────────────────────────────────────────────────
export const listTestPlans = () => api.get<TestPlanSummary[]>('/test-plans').then(r => r.data)
export const getTestPlan = (id: string) => api.get<TestPlanEnriched>(`/test-plans/${id}`).then(r => r.data)
export const createTestPlan = (data: { name: string; description: string; steps: TestPlanStep[] }) =>
  api.post('/test-plans', data).then(r => r.data)
export const updateTestPlan = (id: string, data: { name: string; description: string; steps: TestPlanStep[] }) =>
  api.put(`/test-plans/${id}`, data).then(r => r.data)
export const deleteTestPlan = (id: string) => api.delete(`/test-plans/${id}`)

// ── Executions ────────────────────────────────────────────────────────────────
export const listExecutions = () => api.get<Execution[]>('/executions').then(r => r.data)
export const getExecution = (id: string) => api.get<Execution>(`/executions/${id}`).then(r => r.data)
export const enqueueExecution = (data: { test_plan_id: string; scheduled_at?: string }) =>
  api.post<Execution>('/executions', data).then(r => r.data)
export const cancelExecution = (id: string) => api.delete(`/executions/${id}`)

// ── Reports ───────────────────────────────────────────────────────────────────
export const listReports = () => api.get<ReportSummary[]>('/reports').then(r => r.data)
export const getReport = (id: string) => api.get<ExecutionReport>(`/reports/${id}`).then(r => r.data)
export const deleteReport = (id: string) => api.delete(`/reports/${id}`)

