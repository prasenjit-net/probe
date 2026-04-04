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
}

#[derive(Debug, Deserialize)]
pub struct CreateTestPlan {
    pub name: String,
    pub description: String,
    pub steps: Vec<TestPlanStep>,
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
        }
    }
}
