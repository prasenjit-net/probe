import axios from 'axios'
import type {
  HttpRequest, HttpRequestSummary, Assertion, KeyValue, BodyType, HttpMethod, InputVariable, ExtractVariable,
  TestPlanSummary, TestPlanEnriched, TestPlanStep,
  Execution, ExecutionReport, ReportSummary, StepResult,
  HealthData, MetricsData, MeData,
  SpecSummary, SpecRecord, GenerationPreview, ImportResult,
  Collection, CollectionSummary,
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
  input_variables: InputVariable[]; extract_variables: ExtractVariable[];
  collection_id?: string | null;
}) => api.post<HttpRequest>('/requests', data).then(r => r.data)
export const updateRequest = (id: string, data: {
  name: string; description: string; method: HttpMethod; url: string;
  headers: KeyValue[]; body?: string; body_type: BodyType; assertions: Assertion[];
  input_variables: InputVariable[]; extract_variables: ExtractVariable[];
  collection_id?: string | null;
}) => api.put<HttpRequest>(`/requests/${id}`, data).then(r => r.data)
export const deleteRequest = (id: string) => api.delete(`/requests/${id}`)
export const moveRequest = (id: string, collectionId: string | null) =>
  api.put<HttpRequestSummary>(`/requests/${id}/collection`, { collection_id: collectionId }).then(r => r.data)
export const testFireRequest = (data: {
  name: string; description: string; method: HttpMethod; url: string;
  headers: KeyValue[]; body?: string; body_type: BodyType; assertions: Assertion[];
  input_variables: InputVariable[]; extract_variables: ExtractVariable[];
  variable_values?: Record<string, string>;
}) => api.post<StepResult>('/requests/test-fire', data).then(r => r.data)

// ── Test Plans ────────────────────────────────────────────────────────────────
export const listTestPlans = () => api.get<TestPlanSummary[]>('/test-plans').then(r => r.data)
export const getTestPlan = (id: string) => api.get<TestPlanEnriched>(`/test-plans/${id}`).then(r => r.data)
export const createTestPlan = (data: { name: string; description: string; steps: TestPlanStep[]; collection_id?: string | null }) =>
  api.post('/test-plans', data).then(r => r.data)
export const updateTestPlan = (id: string, data: { name: string; description: string; steps: TestPlanStep[]; collection_id?: string | null }) =>
  api.put(`/test-plans/${id}`, data).then(r => r.data)
export const deleteTestPlan = (id: string) => api.delete(`/test-plans/${id}`)
export const moveTestPlan = (id: string, collectionId: string | null) =>
  api.put<TestPlanSummary>(`/test-plans/${id}/collection`, { collection_id: collectionId }).then(r => r.data)

// ── Executions ────────────────────────────────────────────────────────────────
export const listExecutions = () => api.get<Execution[]>('/executions').then(r => r.data)
export const getExecution = (id: string) => api.get<Execution>(`/executions/${id}`).then(r => r.data)
export const enqueueExecution = (data: { test_plan_id: string; scheduled_at?: string }) =>
  api.post<Execution>('/executions', data).then(r => r.data)
export const cancelExecution = (id: string) => api.delete(`/executions/${id}`)
export const clearExecutions = () => api.delete<{ cleared: number }>('/executions').then(r => r.data)

// ── Reports ───────────────────────────────────────────────────────────────────
export const listReports = () => api.get<ReportSummary[]>('/reports').then(r => r.data)
export const getReport = (id: string) => api.get<ExecutionReport>(`/reports/${id}`).then(r => r.data)
export const deleteReport = (id: string) => api.delete(`/reports/${id}`)

// ── API Specifications ─────────────────────────────────────────────────────────
export const listSpecs = () => api.get<SpecSummary[]>('/specs').then(r => r.data)
export const getSpec   = (id: string) => api.get<SpecRecord>(`/specs/${id}`).then(r => r.data)
export const deleteSpec = (id: string) => api.delete(`/specs/${id}`)

export const uploadSpec = (name: string, file: File) => {
  const fd = new FormData()
  fd.append('name', name)
  fd.append('file', file)
  return api.post<SpecSummary>('/specs', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

export const generateTests = (specId: string, customPrompt?: string) =>
  api.post<GenerationPreview>(`/specs/${specId}/generate`, { custom_prompt: customPrompt ?? '' }).then(r => r.data)

export const importGeneration = (preview: GenerationPreview) =>
  api.post<ImportResult>('/specs/import', preview).then(r => r.data)

// ── Collections ───────────────────────────────────────────────────────────────
export const listCollections = (kind: 'request' | 'plan') =>
  api.get<CollectionSummary[]>('/collections', { params: { kind } }).then(r => r.data)
export const getCollection = (id: string) => api.get<Collection>(`/collections/${id}`).then(r => r.data)
export const createCollection = (data: { name: string; description?: string; color?: string; kind: 'request' | 'plan' }) =>
  api.post<Collection>('/collections', data).then(r => r.data)
export const updateCollection = (id: string, data: { name: string; description?: string; color?: string }) =>
  api.put<Collection>(`/collections/${id}`, data).then(r => r.data)
export const deleteCollection = (id: string) => api.delete(`/collections/${id}`)
