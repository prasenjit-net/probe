//! Background execution engine.
//!
//! A Tokio task polls the execution queue every 5 seconds. When a queued
//! execution is due (scheduled_at ≤ now, or no schedule), it runs the test
//! plan step-by-step, evaluates assertions, extracts variables for chaining,
//! and writes the final report to disk.

use crate::{
    models::{
        Assertion, AssertionOperator, AssertionResult, AssertionType, Execution, ExecutionReport,
        ExecutionStatus, ExtractVariable, HttpMethod, HttpRequest, KeyValue, OverallStatus,
        RequestSnapshot, ResponseSnapshot, StepResult, TestPlan, VariableSource,
    },
    storage,
};
use chrono::Utc;
use regex::Regex;
use reqwest::Client;
use serde_json::Value;
use serde_json_path::JsonPath;
use std::collections::HashMap;
use std::time::Instant;
use tokio::time::{Duration, sleep};
use uuid::Uuid;

/// Spawn the background executor loop. Call once from `main`.
pub fn spawn() {
    tokio::spawn(async move {
        tracing::info!("Execution engine started");
        loop {
            if let Err(e) = poll_and_run().await {
                tracing::error!("Executor error: {e:#}");
            }
            sleep(Duration::from_secs(5)).await;
        }
    });
}

async fn poll_and_run() -> anyhow::Result<()> {
    let executions = storage::list::<Execution>(storage::executions_dir()).await?;
    let now = Utc::now();

    for exec in executions {
        if exec.status != ExecutionStatus::Queued {
            continue;
        }
        // Check if scheduled time has passed (or no schedule = run immediately)
        let due = exec.scheduled_at.map(|t| t <= now).unwrap_or(true);
        if !due {
            continue;
        }
        tracing::info!(id = %exec.id, plan = %exec.test_plan_name, "Starting execution");
        run_execution(exec).await;
        // Run one at a time per poll cycle
        break;
    }
    Ok(())
}

async fn run_execution(mut exec: Execution) {
    // Mark as running
    exec.status = ExecutionStatus::Running;
    exec.started_at = Some(Utc::now());
    if let Err(e) = storage::write(storage::executions_dir(), &exec.id, &exec).await {
        tracing::error!("Failed to save running status: {e}");
        return;
    }

    let plan = match storage::read::<TestPlan>(storage::test_plans_dir(), &exec.test_plan_id).await {
        Ok(p) => p,
        Err(e) => {
            tracing::error!("Test plan not found: {e}");
            finalize_execution(&mut exec, ExecutionStatus::Failed).await;
            return;
        }
    };

    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .unwrap_or_default();

    let started_at = Utc::now();
    let mut step_results: Vec<StepResult> = Vec::new();
    let mut variables: HashMap<String, String> = HashMap::new();
    let mut any_failed = false;

    for step in plan.steps.iter().filter(|s| s.enabled) {
        let req_def = match storage::read::<HttpRequest>(storage::requests_dir(), &step.request_id).await {
            Ok(r) => r,
            Err(e) => {
                step_results.push(StepResult {
                    step_id: step.id.clone(),
                    request_name: step.name.clone(),
                    request: RequestSnapshot {
                        method: "UNKNOWN".into(),
                        url: "".into(),
                        headers: vec![],
                        body: None,
                    },
                    response: None,
                    assertion_results: vec![],
                    passed: false,
                    error: Some(format!("Request definition not found: {e}")),
                });
                any_failed = true;
                continue;
            }
        };

        let step_result = execute_step(&client, &step.id, &req_def, &step.extract_variables, &mut variables).await;
        if !step_result.passed {
            any_failed = true;
        }
        step_results.push(step_result);
    }

    let completed_at = Utc::now();
    let duration_ms = (completed_at - started_at).num_milliseconds().max(0) as u64;
    let total = step_results.len();
    let passed = step_results.iter().filter(|r| r.passed).count();
    let failed = total - passed;

    let report = ExecutionReport {
        id: Uuid::new_v4().to_string(),
        execution_id: exec.id.clone(),
        test_plan_id: exec.test_plan_id.clone(),
        test_plan_name: exec.test_plan_name.clone(),
        overall_status: if any_failed { OverallStatus::Failed } else { OverallStatus::Passed },
        started_at,
        completed_at,
        duration_ms,
        total_steps: total,
        passed_steps: passed,
        failed_steps: failed,
        step_results,
    };

    if let Err(e) = storage::write(storage::reports_dir(), &report.id, &report).await {
        tracing::error!("Failed to write report: {e}");
    }

    exec.report_id = Some(report.id);
    exec.status = if any_failed { ExecutionStatus::Failed } else { ExecutionStatus::Completed };
    exec.completed_at = Some(Utc::now());
    if let Err(e) = storage::write(storage::executions_dir(), &exec.id, &exec).await {
        tracing::error!("Failed to update execution: {e}");
    }

    tracing::info!(
        id = %exec.id,
        status = ?exec.status,
        passed = passed,
        failed = failed,
        "Execution complete"
    );
}

async fn finalize_execution(exec: &mut Execution, status: ExecutionStatus) {
    exec.status = status;
    exec.completed_at = Some(Utc::now());
    let _ = storage::write(storage::executions_dir(), &exec.id, exec).await;
}

async fn execute_step(
    client: &Client,
    step_id: &str,
    req_def: &HttpRequest,
    extract_vars: &[ExtractVariable],
    variables: &mut HashMap<String, String>,
) -> StepResult {
    // Substitute {{variable}} placeholders in URL, headers, and body
    let url = substitute_vars(&req_def.url, variables);

    let mut headers_snapshot: Vec<KeyValue> = Vec::new();
    let mut req_builder = match req_def.method {
        HttpMethod::Get => client.get(&url),
        HttpMethod::Post => client.post(&url),
        HttpMethod::Put => client.put(&url),
        HttpMethod::Patch => client.patch(&url),
        HttpMethod::Delete => client.delete(&url),
        HttpMethod::Head => client.head(&url),
        HttpMethod::Options => client.request(reqwest::Method::OPTIONS, &url),
    };

    for kv in &req_def.headers {
        let v = substitute_vars(&kv.value, variables);
        headers_snapshot.push(KeyValue { key: kv.key.clone(), value: v.clone() });
        if let Ok(name) = reqwest::header::HeaderName::from_bytes(kv.key.as_bytes()) {
            if let Ok(val) = reqwest::header::HeaderValue::from_str(&v) {
                req_builder = req_builder.header(name, val);
            }
        }
    }

    let body_str = req_def.body.as_deref().map(|b| substitute_vars(b, variables));
    if let Some(ref b) = body_str {
        req_builder = req_builder.body(b.clone());
    }

    let request_snapshot = RequestSnapshot {
        method: req_def.method.to_string(),
        url: url.clone(),
        headers: headers_snapshot,
        body: body_str,
    };

    let start = Instant::now();
    let response_result = req_builder.send().await;
    let duration_ms = start.elapsed().as_millis() as u64;

    match response_result {
        Err(e) => StepResult {
            step_id: step_id.to_string(),
            request_name: req_def.name.clone(),
            request: request_snapshot,
            response: None,
            assertion_results: vec![],
            passed: false,
            error: Some(format!("HTTP error: {e}")),
        },
        Ok(resp) => {
            let status_code = resp.status().as_u16();
            let resp_headers: Vec<KeyValue> = resp
                .headers()
                .iter()
                .map(|(k, v)| KeyValue {
                    key: k.to_string(),
                    value: v.to_str().unwrap_or("").to_string(),
                })
                .collect();
            let body = resp.text().await.unwrap_or_default();

            let response_snapshot = ResponseSnapshot {
                status_code,
                headers: resp_headers.clone(),
                body: body.clone(),
                duration_ms,
            };

            // Evaluate assertions
            let assertion_results: Vec<AssertionResult> = req_def
                .assertions
                .iter()
                .map(|a| evaluate_assertion(a, status_code, &body, &resp_headers, duration_ms))
                .collect();

            // Extract variables for subsequent steps
            let body_value: Option<Value> = serde_json::from_str(&body).ok();
            for ev in extract_vars {
                let extracted = extract_variable(ev, status_code, &body, &body_value, &resp_headers);
                if let Some(val) = extracted {
                    variables.insert(ev.var_name.clone(), val);
                }
            }

            let passed = assertion_results.iter().all(|r| r.passed);

            StepResult {
                step_id: step_id.to_string(),
                request_name: req_def.name.clone(),
                request: request_snapshot,
                response: Some(response_snapshot),
                assertion_results,
                passed,
                error: None,
            }
        }
    }
}

fn substitute_vars(input: &str, vars: &HashMap<String, String>) -> String {
    let mut result = input.to_string();
    for (k, v) in vars {
        result = result.replace(&format!("{{{{{k}}}}}"), v);
    }
    result
}

fn evaluate_assertion(
    assertion: &Assertion,
    status_code: u16,
    body: &str,
    headers: &[KeyValue],
    duration_ms: u64,
) -> AssertionResult {
    let (actual, passed, message) = match &assertion.assertion_type {
        AssertionType::StatusCode => {
            let actual = status_code.to_string();
            let (p, m) = compare_values(&assertion.operator, &actual, &assertion.expected_value, false);
            (actual, p, m)
        }
        AssertionType::BodyContains => {
            let (p, m) = compare_values(&assertion.operator, body, &assertion.expected_value, true);
            (body.chars().take(200).collect(), p, m)
        }
        AssertionType::JsonPath => {
            let target = assertion.target.as_deref().unwrap_or("$");
            let actual = extract_json_path(body, target);
            let (p, m) = compare_values(&assertion.operator, &actual, &assertion.expected_value, false);
            (actual, p, m)
        }
        AssertionType::Header => {
            let target = assertion.target.as_deref().unwrap_or("").to_lowercase();
            let header_val = headers
                .iter()
                .find(|h| h.key.to_lowercase() == target)
                .map(|h| h.value.clone())
                .unwrap_or_default();
            let (p, m) = compare_values(&assertion.operator, &header_val, &assertion.expected_value, false);
            (header_val, p, m)
        }
        AssertionType::ResponseTime => {
            let actual = duration_ms.to_string();
            let (p, m) = compare_values(&assertion.operator, &actual, &assertion.expected_value, false);
            (actual, p, m)
        }
    };

    AssertionResult {
        assertion_id: assertion.id.clone(),
        assertion_type: assertion.assertion_type.clone(),
        operator: assertion.operator.clone(),
        target: assertion.target.clone(),
        expected: assertion.expected_value.clone(),
        actual,
        passed,
        message,
    }
}

fn compare_values(op: &AssertionOperator, actual: &str, expected: &str, is_body: bool) -> (bool, String) {
    match op {
        AssertionOperator::Equals => {
            let p = actual == expected;
            (p, format!("Expected {actual:?} to equal {expected:?}"))
        }
        AssertionOperator::NotEquals => {
            let p = actual != expected;
            (p, format!("Expected {actual:?} to not equal {expected:?}"))
        }
        AssertionOperator::Contains => {
            let p = actual.contains(expected);
            let snippet = if is_body { format!("body") } else { format!("{actual:?}") };
            (p, format!("Expected {snippet} to contain {expected:?}"))
        }
        AssertionOperator::NotContains => {
            let p = !actual.contains(expected);
            let snippet = if is_body { format!("body") } else { format!("{actual:?}") };
            (p, format!("Expected {snippet} to not contain {expected:?}"))
        }
        AssertionOperator::GreaterThan => {
            match (actual.parse::<f64>(), expected.parse::<f64>()) {
                (Ok(a), Ok(e)) => (a > e, format!("Expected {a} > {e}")),
                _ => (false, format!("Cannot compare non-numeric values: {actual:?} > {expected:?}")),
            }
        }
        AssertionOperator::LessThan => {
            match (actual.parse::<f64>(), expected.parse::<f64>()) {
                (Ok(a), Ok(e)) => (a < e, format!("Expected {a} < {e}")),
                _ => (false, format!("Cannot compare non-numeric values: {actual:?} < {expected:?}")),
            }
        }
        AssertionOperator::Regex => {
            match Regex::new(expected) {
                Ok(re) => {
                    let p = re.is_match(actual);
                    (p, format!("Expected {actual:?} to match regex {expected:?}"))
                }
                Err(e) => (false, format!("Invalid regex {expected:?}: {e}")),
            }
        }
    }
}

fn extract_json_path(body: &str, path: &str) -> String {
    let value: Value = match serde_json::from_str(body) {
        Ok(v) => v,
        Err(_) => return String::new(),
    };
    match JsonPath::parse(path) {
        Ok(jp) => {
            let nodes = jp.query(&value);
            match nodes.first() {
                Some(v) => match v {
                    Value::String(s) => s.clone(),
                    other => other.to_string(),
                },
                None => String::new(),
            }
        }
        Err(_) => String::new(),
    }
}

fn extract_variable(
    ev: &ExtractVariable,
    status_code: u16,
    body: &str,
    body_value: &Option<Value>,
    headers: &[KeyValue],
) -> Option<String> {
    match ev.source {
        VariableSource::StatusCode => Some(status_code.to_string()),
        VariableSource::ResponseHeader => headers
            .iter()
            .find(|h| h.key.to_lowercase() == ev.path.to_lowercase())
            .map(|h| h.value.clone()),
        VariableSource::ResponseBody => {
            if let Some(val) = body_value {
                if let Ok(jp) = JsonPath::parse(&ev.path) {
                    let nodes = jp.query(val);
                    return nodes.first().map(|v| match v {
                        Value::String(s) => s.clone(),
                        other => other.to_string(),
                    });
                }
            }
            // Fallback: return raw body if path is "$" or empty
            if ev.path == "$" || ev.path.is_empty() {
                Some(body.to_string())
            } else {
                None
            }
        }
    }
}
