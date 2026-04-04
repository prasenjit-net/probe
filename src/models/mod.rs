use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ── HTTP Method ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HttpMethod {
    Get,
    Post,
    Put,
    Patch,
    Delete,
    Head,
    Options,
}

impl std::fmt::Display for HttpMethod {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            HttpMethod::Get => "GET",
            HttpMethod::Post => "POST",
            HttpMethod::Put => "PUT",
            HttpMethod::Patch => "PATCH",
            HttpMethod::Delete => "DELETE",
            HttpMethod::Head => "HEAD",
            HttpMethod::Options => "OPTIONS",
        };
        write!(f, "{}", s)
    }
}

// ── Assertion ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AssertionType {
    StatusCode,
    BodyContains,
    JsonPath,
    Header,
    ResponseTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AssertionOperator {
    Equals,
    NotEquals,
    Contains,
    NotContains,
    GreaterThan,
    LessThan,
    Regex,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Assertion {
    pub id: String,
    #[serde(rename = "type")]
    pub assertion_type: AssertionType,
    pub operator: AssertionOperator,
    /// Header name or JSON path (e.g. `$.data.token`). Unused for status_code / body_contains.
    pub target: Option<String>,
    pub expected_value: String,
}

// ── Key-Value pair (headers / query params) ────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyValue {
    pub key: String,
    pub value: String,
}

// ── Body type ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum BodyType {
    Json,
    Text,
    FormUrlEncoded,
    None,
}

// ── HttpRequest (library item) ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpRequest {
    pub id: String,
    pub name: String,
    pub description: String,
    pub method: HttpMethod,
    pub url: String,
    pub headers: Vec<KeyValue>,
    pub body: Option<String>,
    pub body_type: BodyType,
    pub assertions: Vec<Assertion>,
    /// Documents the `{{placeholder}}` variables this request expects.
    #[serde(default)]
    pub input_variables: Vec<InputVariable>,
    /// Output variables to extract from the response after this request runs.
    #[serde(default)]
    pub extract_variables: Vec<ExtractVariable>,
    /// Optional collection this request belongs to.
    #[serde(default)]
    pub collection_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ── Variable System ────────────────────────────────────────────────────────────

/// Documents an expected `{{placeholder}}` inside a request's URL/headers/body.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InputVariable {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub default_value: Option<String>,
}

/// Where to extract an output variable from after a response is received.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractVariable {
    pub var_name: String,
    /// JSON path (`$.token`) or header name when source is `response_header`
    pub path: String,
    pub source: VariableSource,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum VariableSource {
    ResponseBody,
    ResponseHeader,
    StatusCode,
}

/// How to resolve a specific input variable before a step executes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum MappingSource {
    /// Use a literal constant string value.
    Constant { value: String },
    /// Use the output variable extracted by a previous step.
    StepOutput { step_id: String, step_name: String, var_name: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariableMapping {
    /// Matches a `{{name}}` placeholder in the request.
    pub var_name: String,
    pub source: MappingSource,
}

/// A variable value captured at runtime (used in StepResult).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedVariable {
    pub name: String,
    pub value: Option<String>,
    /// Human-readable provenance, e.g. "Constant" or "Step 2 → token"
    pub source_label: String,
}

// ── Test Plan ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestPlanStep {
    pub id: String,
    pub request_id: String,
    pub name: String,
    pub enabled: bool,
    pub extract_variables: Vec<ExtractVariable>,
    /// Explicit mappings for input placeholders in this step's request.
    #[serde(default)]
    pub variable_mappings: Vec<VariableMapping>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestPlan {
    pub id: String,
    pub name: String,
    pub description: String,
    /// Optional collection this plan belongs to.
    #[serde(default)]
    pub collection_id: Option<String>,
    pub steps: Vec<TestPlanStep>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ── Execution (queue entry) ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionStatus {
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Execution {
    pub id: String,
    pub test_plan_id: String,
    pub test_plan_name: String,
    pub status: ExecutionStatus,
    /// None = run immediately; Some = run at or after this time
    pub scheduled_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub report_id: Option<String>,
}

// ── Execution Report ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssertionResult {
    pub assertion_id: String,
    #[serde(rename = "type")]
    pub assertion_type: AssertionType,
    pub operator: AssertionOperator,
    pub target: Option<String>,
    pub expected: String,
    pub actual: String,
    pub passed: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestSnapshot {
    pub method: String,
    pub url: String,
    pub headers: Vec<KeyValue>,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResponseSnapshot {
    pub status_code: u16,
    pub headers: Vec<KeyValue>,
    pub body: String,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepResult {
    pub step_id: String,
    pub request_name: String,
    pub request: RequestSnapshot,
    pub response: Option<ResponseSnapshot>,
    pub assertion_results: Vec<AssertionResult>,
    pub passed: bool,
    pub error: Option<String>,
    /// Input variable values as resolved just before this step executed.
    #[serde(default)]
    pub input_variables: Vec<ResolvedVariable>,
    /// Output variable values extracted from this step's response.
    #[serde(default)]
    pub output_variables: Vec<ResolvedVariable>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum OverallStatus {
    Passed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionReport {
    pub id: String,
    pub execution_id: String,
    pub test_plan_id: String,
    pub test_plan_name: String,
    pub overall_status: OverallStatus,
    pub started_at: DateTime<Utc>,
    pub completed_at: DateTime<Utc>,
    pub duration_ms: u64,
    pub total_steps: usize,
    pub passed_steps: usize,
    pub failed_steps: usize,
    pub step_results: Vec<StepResult>,
    #[serde(default)]
    pub collection_id: Option<String>,
    #[serde(default)]
    pub ai_summary: Option<String>,
}

// ── Request/Response DTOs ──────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateHttpRequest {
    pub name: String,
    pub description: String,
    pub method: HttpMethod,
    pub url: String,
    pub headers: Vec<KeyValue>,
    pub body: Option<String>,
    pub body_type: BodyType,
    pub assertions: Vec<Assertion>,
    #[serde(default)]
    pub input_variables: Vec<InputVariable>,
    #[serde(default)]
    pub extract_variables: Vec<ExtractVariable>,
    #[serde(default)]
    pub collection_id: Option<String>,
}

/// Payload for the ad-hoc test-fire endpoint. Extends CreateHttpRequest with
/// user-supplied constant values for input variables.
#[derive(Debug, Deserialize)]
pub struct TestFireRequest {
    #[serde(flatten)]
    pub request: CreateHttpRequest,
    /// Constant values to inject for each `{{placeholder}}`.
    #[serde(default)]
    pub variable_values: std::collections::HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTestPlan {
    pub name: String,
    pub description: String,
    pub steps: Vec<TestPlanStep>,
    #[serde(default)]
    pub collection_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateExecution {
    pub test_plan_id: String,
    pub scheduled_at: Option<DateTime<Utc>>,
}

// ── Summary types (for list endpoints) ────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct HttpRequestSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub method: HttpMethod,
    pub url: String,
    pub assertion_count: usize,
    pub collection_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<&HttpRequest> for HttpRequestSummary {
    fn from(r: &HttpRequest) -> Self {
        Self {
            id: r.id.clone(),
            name: r.name.clone(),
            description: r.description.clone(),
            method: r.method.clone(),
            url: r.url.clone(),
            assertion_count: r.assertions.len(),
            collection_id: r.collection_id.clone(),
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct TestPlanSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub step_count: usize,
    pub collection_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<&TestPlan> for TestPlanSummary {
    fn from(p: &TestPlan) -> Self {
        Self {
            id: p.id.clone(),
            name: p.name.clone(),
            description: p.description.clone(),
            step_count: p.steps.len(),
            collection_id: p.collection_id.clone(),
            created_at: p.created_at,
            updated_at: p.updated_at,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct ReportSummary {
    pub id: String,
    pub execution_id: String,
    pub test_plan_id: String,
    pub test_plan_name: String,
    pub overall_status: OverallStatus,
    pub started_at: DateTime<Utc>,
    pub completed_at: DateTime<Utc>,
    pub duration_ms: u64,
    pub total_steps: usize,
    pub passed_steps: usize,
    pub failed_steps: usize,
    pub collection_id: Option<String>,
}

impl From<&ExecutionReport> for ReportSummary {
    fn from(r: &ExecutionReport) -> Self {
        Self {
            id: r.id.clone(),
            execution_id: r.execution_id.clone(),
            test_plan_id: r.test_plan_id.clone(),
            test_plan_name: r.test_plan_name.clone(),
            overall_status: r.overall_status.clone(),
            started_at: r.started_at,
            completed_at: r.completed_at,
            duration_ms: r.duration_ms,
            total_steps: r.total_steps,
            passed_steps: r.passed_steps,
            failed_steps: r.failed_steps,
            collection_id: r.collection_id.clone(),
        }
    }
}

// ── API Specification (OpenAPI) ────────────────────────────────────────────────

/// Stored OpenAPI specification record (content + metadata in one file).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpecRecord {
    pub id: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    /// Number of (path, method) pairs found in the spec.
    pub endpoint_count: usize,
    /// Full normalized OpenAPI JSON content.
    pub content: serde_json::Value,
}

/// Lightweight summary for listing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpecSummary {
    pub id: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub endpoint_count: usize,
}

impl From<&SpecRecord> for SpecSummary {
    fn from(r: &SpecRecord) -> Self {
        Self {
            id: r.id.clone(),
            name: r.name.clone(),
            created_at: r.created_at,
            endpoint_count: r.endpoint_count,
        }
    }
}

// ── AI Generation preview (returned before import) ─────────────────────────────

/// Variable mapping in a plan step preview — uses step_index instead of step_id.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum MappingSourcePreview {
    Constant { value: String },
    /// References a previous step by its 0-based position in the steps array.
    StepOutput { step_index: usize, var_name: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VarMappingPreview {
    pub var_name: String,
    pub source: MappingSourcePreview,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanStepPreview {
    /// Must match the `name` of one of the requests in `GenerationPreview.requests`.
    pub request_name: String,
    /// Optional override for the step display name.
    pub step_name: String,
    pub variable_mappings: Vec<VarMappingPreview>,
}

/// Full generation result returned by `/api/specs/{id}/generate-tests`.
/// The user can review and edit this, then POST it to `.../import` to persist.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationPreview {
    pub spec_id: String,
    pub requests: Vec<GeneratedRequest>,
    pub plan_name: String,
    pub plan_description: String,
    pub plan_steps: Vec<PlanStepPreview>,
}

/// A single generated request (mirrors CreateHttpRequest but also carries
/// assertions already with UUIDs so the UI can display them).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedRequest {
    pub name: String,
    pub description: String,
    pub method: HttpMethod,
    pub url: String,
    pub headers: Vec<KeyValue>,
    pub body: Option<String>,
    pub body_type: BodyType,
    pub assertions: Vec<Assertion>,
    #[serde(default)]
    pub input_variables: Vec<InputVariable>,
    #[serde(default)]
    pub extract_variables: Vec<ExtractVariable>,
}

// ── Collection ─────────────────────────────────────────────────────────────────

/// A named container that groups related requests and test plans.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Collection {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    /// Tailwind color name e.g. "indigo", "emerald", "blue", "amber", "rose", "purple", "teal", "orange"
    #[serde(default = "default_collection_color")]
    pub color: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

fn default_collection_color() -> String {
    "indigo".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub color: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<&Collection> for CollectionSummary {
    fn from(c: &Collection) -> Self {
        Self {
            id: c.id.clone(),
            name: c.name.clone(),
            description: c.description.clone(),
            color: c.color.clone(),
            created_at: c.created_at,
            updated_at: c.updated_at,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateCollection {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_collection_color")]
    pub color: String,
}

/// Payload for the lightweight "move item to a collection" endpoint.
#[derive(Debug, Deserialize)]
pub struct MoveToCollection {
    pub collection_id: Option<String>,
}
