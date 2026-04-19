//! Background execution engine.
//!
//! A Tokio task polls the execution queue every 5 seconds. When a queued
//! execution is due (scheduled_at ≤ now, or no schedule), it runs the test
//! plan step-by-step, evaluates assertions, extracts variables for chaining,
//! and writes the final report to disk.

use crate::{
    ai_generator,
    models::{
        Assertion, AssertionOperator, AssertionResult, AssertionType, Environment, Execution,
        ExecutionMode, ExecutionReport, ExecutionStatus, ExtractVariable, HttpMethod, HttpRequest,
        KeyValue, LoadTestConfig, LoadTestErrorSummary, LoadTestIterationSample,
        LoadTestStepSummary, LoadTestSummary, MappingSource, OverallStatus, RequestSnapshot,
        ResolvedVariable, ResponseSnapshot, StepResult, TestPlan, TestPlanStep, VariableMapping,
        VariableSource,
    },
    state::AppState,
    storage,
};
use chrono::Utc;
use regex::Regex;
use reqwest::Client;
use serde_json::Value;
use serde_json_path::JsonPath;
use std::{
    collections::{BTreeMap, HashMap},
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Instant,
};
use tokio::{
    task::JoinSet,
    time::{Duration, sleep},
};
use uuid::Uuid;

/// Spawn the background executor loop. Call once from `main`.
pub fn spawn(state: AppState) {
    tokio::spawn(async move {
        tracing::info!("Execution engine started");
        loop {
            if let Err(e) = poll_and_run(&state).await {
                tracing::error!("Executor error: {e:#}");
            }
            sleep(Duration::from_secs(5)).await;
        }
    });
}

async fn poll_and_run(state: &AppState) -> anyhow::Result<()> {
    let _lock = state.execution_lock.lock().await;
    let executions = storage::read_vec::<Execution>(storage::executions_file())
        .await
        .unwrap_or_default();
    let now = Utc::now();

    let next = executions.into_iter().find(|exec| {
        exec.status == ExecutionStatus::Queued
            && exec.scheduled_at.map(|t| t <= now).unwrap_or(true)
    });

    if let Some(exec) = next {
        tracing::info!(id = %exec.id, plan = %exec.test_plan_name, "Starting execution");
        // Release lock before running (execution can take a long time)
        drop(_lock);
        run_execution(exec, state).await;
    }
    Ok(())
}

#[derive(Clone)]
struct ExecutableStep {
    step: TestPlanStep,
    request: Option<HttpRequest>,
    load_error: Option<String>,
}

struct IterationOutcome {
    iteration: u64,
    passed: bool,
    duration_ms: u64,
    step_results: Vec<StepResult>,
}

struct StepAggregate {
    step_name: String,
    durations: Vec<u64>,
    passed_requests: u64,
    failed_requests: u64,
}

async fn run_execution(mut exec: Execution, state: &AppState) {
    // Mark as running
    exec.status = ExecutionStatus::Running;
    exec.started_at = Some(Utc::now());
    update_execution_in_file(&exec, state).await;

    let plan = match storage::read::<TestPlan>(storage::test_plans_dir(), &exec.test_plan_id).await
    {
        Ok(p) => p,
        Err(e) => {
            tracing::error!("Test plan not found: {e}");
            finalize_execution(&mut exec, ExecutionStatus::Failed, state).await;
            state.clear_cancellation(&exec.id);
            return;
        }
    };

    let client = build_http_client();
    let base_variables = load_environment_variables(&exec).await;
    let executable_steps = load_executable_steps(&plan).await;

    let (mut report, execution_status, passed, failed) = match exec.mode {
        ExecutionMode::Standard => {
            run_standard_execution(&exec, &plan, &client, &executable_steps, &base_variables).await
        }
        ExecutionMode::LoadTest => {
            run_load_test_execution(
                state,
                &exec,
                &plan,
                &client,
                &executable_steps,
                &base_variables,
            )
            .await
        }
    };

    // Save report immediately so it's available even if AI summary fails
    if let Err(e) = storage::write(storage::reports_dir(), &report.id, &report).await {
        tracing::error!("Failed to write report: {e}");
    }

    // Generate AI summary for standard reports only.
    if report.execution_mode == ExecutionMode::Standard
        && let Some(summary) =
            ai_generator::generate_report_summary(&report, &state.config.openai).await
    {
        report.ai_summary = Some(summary);
        if let Err(e) = storage::write(storage::reports_dir(), &report.id, &report).await {
            tracing::error!("Failed to save report with AI summary: {e}");
        }
    }

    exec.report_id = Some(report.id.clone());
    exec.status = execution_status;
    exec.completed_at = Some(Utc::now());
    update_execution_in_file(&exec, state).await;
    state.clear_cancellation(&exec.id);

    tracing::info!(
        id = %exec.id,
        status = ?exec.status,
        passed = passed,
        failed = failed,
        "Execution complete"
    );
}

fn build_http_client() -> Client {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .unwrap_or_default()
}

async fn load_environment_variables(exec: &Execution) -> HashMap<String, String> {
    let mut variables = HashMap::new();
    if let Some(env_id) = &exec.environment_id {
        match storage::read::<Environment>(storage::environments_dir(), env_id).await {
            Ok(env) => {
                tracing::debug!(env = %env.name, vars = env.variables.len(), "Seeding environment variables");
                variables.extend(env.variables);
            }
            Err(e) => tracing::warn!("Could not load environment {env_id}: {e}"),
        }
    }
    variables
}

async fn load_executable_steps(plan: &TestPlan) -> Vec<ExecutableStep> {
    let mut steps = Vec::new();
    for step in plan.steps.iter().filter(|s| s.enabled) {
        let (request, load_error) =
            match storage::read::<HttpRequest>(storage::requests_dir(), &step.request_id).await {
                Ok(request) => (Some(request), None),
                Err(e) => (None, Some(format!("Request definition not found: {e}"))),
            };
        steps.push(ExecutableStep {
            step: step.clone(),
            request,
            load_error,
        });
    }
    steps
}

async fn run_standard_execution(
    exec: &Execution,
    plan: &TestPlan,
    client: &Client,
    executable_steps: &[ExecutableStep],
    base_variables: &HashMap<String, String>,
) -> (ExecutionReport, ExecutionStatus, usize, usize) {
    let started_at = Utc::now();
    let mut variables = base_variables.clone();
    let step_results = execute_loaded_plan(client, executable_steps, &mut variables).await;
    let completed_at = Utc::now();
    let duration_ms = (completed_at - started_at).num_milliseconds().max(0) as u64;
    let passed = step_results.iter().filter(|r| r.passed).count();
    let failed = step_results.len().saturating_sub(passed);
    let any_failed = failed > 0;

    (
        ExecutionReport {
            id: Uuid::new_v4().to_string(),
            execution_id: exec.id.clone(),
            test_plan_id: exec.test_plan_id.clone(),
            test_plan_name: exec.test_plan_name.clone(),
            overall_status: if any_failed {
                OverallStatus::Failed
            } else {
                OverallStatus::Passed
            },
            execution_mode: ExecutionMode::Standard,
            started_at,
            completed_at,
            duration_ms,
            total_steps: step_results.len(),
            passed_steps: passed,
            failed_steps: failed,
            step_results,
            collection_id: plan.collection_id.clone(),
            ai_summary: None,
            load_test_summary: None,
        },
        if any_failed {
            ExecutionStatus::Failed
        } else {
            ExecutionStatus::Completed
        },
        passed,
        failed,
    )
}

async fn run_load_test_execution(
    state: &AppState,
    exec: &Execution,
    plan: &TestPlan,
    client: &Client,
    executable_steps: &[ExecutableStep],
    base_variables: &HashMap<String, String>,
) -> (ExecutionReport, ExecutionStatus, usize, usize) {
    let Some(config) = exec.load_test_config.clone() else {
        let now = Utc::now();
        return (
            ExecutionReport {
                id: Uuid::new_v4().to_string(),
                execution_id: exec.id.clone(),
                test_plan_id: exec.test_plan_id.clone(),
                test_plan_name: exec.test_plan_name.clone(),
                overall_status: OverallStatus::Failed,
                execution_mode: ExecutionMode::LoadTest,
                started_at: now,
                completed_at: now,
                duration_ms: 0,
                total_steps: 0,
                passed_steps: 0,
                failed_steps: 0,
                step_results: vec![],
                collection_id: plan.collection_id.clone(),
                ai_summary: None,
                load_test_summary: Some(LoadTestSummary {
                    config: LoadTestConfig {
                        concurrency: 1,
                        duration_seconds: None,
                        total_iterations: None,
                        ramp_up_seconds: None,
                    },
                    total_iterations: 0,
                    successful_iterations: 0,
                    failed_iterations: 0,
                    total_requests: 0,
                    cancelled: false,
                    avg_iteration_duration_ms: 0.0,
                    p95_iteration_duration_ms: 0,
                    throughput_iterations_per_sec: 0.0,
                    throughput_requests_per_sec: 0.0,
                    per_step: vec![],
                    error_counts: vec![LoadTestErrorSummary {
                        step_id: "load_test".into(),
                        step_name: "Load test".into(),
                        error: "Missing load_test_config".into(),
                        count: 1,
                    }],
                    sampled_iterations: vec![],
                }),
            },
            ExecutionStatus::Failed,
            0,
            0,
        );
    };

    let started_at = Utc::now();
    let wall_start = Instant::now();
    let deadline = config
        .duration_seconds
        .map(|secs| wall_start + Duration::from_secs(secs));
    let total_iterations = config.total_iterations;
    let issued = Arc::new(AtomicU64::new(0));
    let mut join_set = JoinSet::new();

    for worker_index in 0..config.concurrency {
        let worker_exec_id = exec.id.clone();
        let worker_steps = executable_steps.to_vec();
        let worker_vars = base_variables.clone();
        let worker_client = client.clone();
        let worker_state = state.clone();
        let worker_issued = Arc::clone(&issued);
        let worker_config = config.clone();
        join_set.spawn(async move {
            if let Some(delay) = ramp_up_delay(
                worker_index,
                worker_config.concurrency,
                worker_config.ramp_up_seconds,
            ) {
                sleep(delay).await;
            }

            let mut outcomes = Vec::new();
            loop {
                if worker_state.is_cancellation_requested(&worker_exec_id) {
                    break;
                }
                if let Some(end) = deadline
                    && Instant::now() >= end
                {
                    break;
                }

                let iteration = worker_issued.fetch_add(1, Ordering::SeqCst) + 1;
                if let Some(max_iterations) = total_iterations
                    && iteration > max_iterations
                {
                    break;
                }

                let mut variables = worker_vars.clone();
                let start = Instant::now();
                let step_results =
                    execute_loaded_plan(&worker_client, &worker_steps, &mut variables).await;
                outcomes.push(IterationOutcome {
                    iteration,
                    passed: step_results.iter().all(|r| r.passed),
                    duration_ms: start.elapsed().as_millis() as u64,
                    step_results,
                });
            }

            outcomes
        });
    }

    let mut outcomes = Vec::new();
    while let Some(result) = join_set.join_next().await {
        match result {
            Ok(worker_outcomes) => outcomes.extend(worker_outcomes),
            Err(e) => tracing::error!("Load-test worker failed: {e}"),
        }
    }

    outcomes.sort_by_key(|outcome| outcome.iteration);

    let duration_ms = wall_start.elapsed().as_millis() as u64;
    let cancelled = state.is_cancellation_requested(&exec.id);
    let mut successful_iterations = 0_u64;
    let mut failed_iterations = 0_u64;
    let mut total_requests = 0_u64;
    let mut iteration_durations = Vec::new();
    let mut step_aggregates: BTreeMap<String, StepAggregate> = BTreeMap::new();
    let mut error_counts: BTreeMap<(String, String, String), u64> = BTreeMap::new();
    let mut sampled_iterations = Vec::new();
    let mut success_samples = 0_usize;

    for outcome in &outcomes {
        total_requests += outcome.step_results.len() as u64;
        iteration_durations.push(outcome.duration_ms);
        if outcome.passed {
            successful_iterations += 1;
            if success_samples < 3 {
                sampled_iterations.push(LoadTestIterationSample {
                    iteration: outcome.iteration,
                    passed: true,
                    duration_ms: outcome.duration_ms,
                    step_results: outcome.step_results.clone(),
                });
                success_samples += 1;
            }
        } else {
            failed_iterations += 1;
            if sampled_iterations
                .iter()
                .filter(|sample| !sample.passed)
                .count()
                < 10
            {
                sampled_iterations.push(LoadTestIterationSample {
                    iteration: outcome.iteration,
                    passed: false,
                    duration_ms: outcome.duration_ms,
                    step_results: outcome.step_results.clone(),
                });
            }
        }

        for step_result in &outcome.step_results {
            let aggregate = step_aggregates
                .entry(step_result.step_id.clone())
                .or_insert_with(|| StepAggregate {
                    step_name: step_result.request_name.clone(),
                    durations: Vec::new(),
                    passed_requests: 0,
                    failed_requests: 0,
                });

            if let Some(response) = &step_result.response {
                aggregate.durations.push(response.duration_ms);
            }

            if step_result.passed {
                aggregate.passed_requests += 1;
            } else {
                aggregate.failed_requests += 1;
                let error_label = step_result
                    .error
                    .clone()
                    .unwrap_or_else(|| "Assertion failed".to_string());
                *error_counts
                    .entry((
                        step_result.step_id.clone(),
                        step_result.request_name.clone(),
                        error_label,
                    ))
                    .or_insert(0) += 1;
            }
        }
    }

    let per_step = step_aggregates
        .into_iter()
        .map(|(step_id, aggregate)| {
            let total = aggregate.passed_requests + aggregate.failed_requests;
            let (avg_duration_ms, min_duration_ms, max_duration_ms, p95_duration_ms) =
                summarize_durations(&aggregate.durations);
            LoadTestStepSummary {
                step_id,
                step_name: aggregate.step_name,
                total_requests: total,
                passed_requests: aggregate.passed_requests,
                failed_requests: aggregate.failed_requests,
                avg_duration_ms,
                min_duration_ms,
                max_duration_ms,
                p95_duration_ms,
            }
        })
        .collect();

    let error_counts = error_counts
        .into_iter()
        .map(
            |((step_id, step_name, error), count)| LoadTestErrorSummary {
                step_id,
                step_name,
                error,
                count,
            },
        )
        .collect();

    let (avg_iteration_duration_ms, _, _, p95_iteration_duration_ms) =
        summarize_durations(&iteration_durations);
    let seconds = (duration_ms as f64 / 1000.0).max(0.001);
    let summary = LoadTestSummary {
        config: config.clone(),
        total_iterations: outcomes.len() as u64,
        successful_iterations,
        failed_iterations,
        total_requests,
        cancelled,
        avg_iteration_duration_ms,
        p95_iteration_duration_ms,
        throughput_iterations_per_sec: outcomes.len() as f64 / seconds,
        throughput_requests_per_sec: total_requests as f64 / seconds,
        per_step,
        error_counts,
        sampled_iterations,
    };

    let completed_at = Utc::now();
    let execution_status = if cancelled {
        ExecutionStatus::Cancelled
    } else if failed_iterations > 0 {
        ExecutionStatus::Failed
    } else {
        ExecutionStatus::Completed
    };

    (
        ExecutionReport {
            id: Uuid::new_v4().to_string(),
            execution_id: exec.id.clone(),
            test_plan_id: exec.test_plan_id.clone(),
            test_plan_name: exec.test_plan_name.clone(),
            overall_status: if cancelled || failed_iterations > 0 {
                OverallStatus::Failed
            } else {
                OverallStatus::Passed
            },
            execution_mode: ExecutionMode::LoadTest,
            started_at,
            completed_at,
            duration_ms,
            total_steps: outcomes.len(),
            passed_steps: successful_iterations as usize,
            failed_steps: failed_iterations as usize,
            step_results: vec![],
            collection_id: plan.collection_id.clone(),
            ai_summary: None,
            load_test_summary: Some(summary),
        },
        execution_status,
        successful_iterations as usize,
        failed_iterations as usize,
    )
}

fn ramp_up_delay(
    worker_index: usize,
    concurrency: usize,
    ramp_up_seconds: Option<u64>,
) -> Option<Duration> {
    let ramp = ramp_up_seconds?;
    if ramp == 0 || concurrency <= 1 || worker_index == 0 {
        return None;
    }
    let total_ms = ramp.saturating_mul(1000);
    let delay_ms = total_ms.saturating_mul(worker_index as u64) / (concurrency as u64 - 1);
    Some(Duration::from_millis(delay_ms))
}

fn summarize_durations(durations: &[u64]) -> (f64, u64, u64, u64) {
    if durations.is_empty() {
        return (0.0, 0, 0, 0);
    }
    let total: u64 = durations.iter().sum();
    let avg = total as f64 / durations.len() as f64;
    let min = *durations.iter().min().unwrap_or(&0);
    let max = *durations.iter().max().unwrap_or(&0);
    let mut sorted = durations.to_vec();
    sorted.sort_unstable();
    let p95_index = ((sorted.len() - 1) * 95) / 100;
    let p95 = sorted[p95_index];
    (avg, min, max, p95)
}

async fn execute_loaded_plan(
    client: &Client,
    executable_steps: &[ExecutableStep],
    variables: &mut HashMap<String, String>,
) -> Vec<StepResult> {
    let mut step_results = Vec::new();
    for executable in executable_steps {
        match (&executable.request, &executable.load_error) {
            (Some(request), _) => {
                let step_result = execute_step(
                    client,
                    &executable.step.id,
                    request,
                    &executable.step.variable_mappings,
                    variables,
                )
                .await;
                step_results.push(step_result);
            }
            (None, Some(error)) => step_results.push(StepResult {
                step_id: executable.step.id.clone(),
                request_name: executable.step.name.clone(),
                request: RequestSnapshot {
                    method: "UNKNOWN".into(),
                    url: "".into(),
                    headers: vec![],
                    body: None,
                },
                response: None,
                assertion_results: vec![],
                passed: false,
                error: Some(error.clone()),
                input_variables: vec![],
                output_variables: vec![],
            }),
            (None, None) => step_results.push(StepResult {
                step_id: executable.step.id.clone(),
                request_name: executable.step.name.clone(),
                request: RequestSnapshot {
                    method: "UNKNOWN".into(),
                    url: "".into(),
                    headers: vec![],
                    body: None,
                },
                response: None,
                assertion_results: vec![],
                passed: false,
                error: Some("Request definition missing".into()),
                input_variables: vec![],
                output_variables: vec![],
            }),
        }
    }
    step_results
}

/// Update a single execution record inside the shared file (lock not held — caller manages).
async fn update_execution_in_file(exec: &Execution, state: &AppState) {
    let _lock = state.execution_lock.lock().await;
    let mut items = storage::read_vec::<Execution>(storage::executions_file())
        .await
        .unwrap_or_default();
    if let Some(pos) = items.iter().position(|e| e.id == exec.id) {
        items[pos] = exec.clone();
    } else {
        items.push(exec.clone());
    }
    let max = state.config.app.max_executions;
    // Trim: keep active entries + most-recent finished up to max
    items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    if items.len() > max {
        let mut active: Vec<Execution> = Vec::new();
        let mut finished: Vec<Execution> = Vec::new();
        for e in items {
            match e.status {
                ExecutionStatus::Queued | ExecutionStatus::Running => active.push(e),
                _ => finished.push(e),
            }
        }
        let slots = max.saturating_sub(active.len());
        let mut kept: Vec<Execution> = active;
        kept.extend(finished.into_iter().take(slots));
        kept.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        items = kept;
    }
    if let Err(e) = storage::write_vec(storage::executions_file(), &items).await {
        tracing::error!("Failed to persist execution update: {e}");
    }
}

async fn finalize_execution(exec: &mut Execution, status: ExecutionStatus, state: &AppState) {
    exec.status = status;
    exec.completed_at = Some(Utc::now());
    update_execution_in_file(exec, state).await;
}

pub async fn execute_step(
    client: &Client,
    step_id: &str,
    req_def: &HttpRequest,
    variable_mappings: &[VariableMapping],
    variables: &mut HashMap<String, String>,
) -> StepResult {
    // Apply explicit variable mappings first — seed the vars context for this step.
    // Constant sources inject directly; StepOutput sources should already be present
    // from previous steps, but we record them for traceability.
    let mut input_variables: Vec<ResolvedVariable> = Vec::new();
    for mapping in variable_mappings {
        match &mapping.source {
            MappingSource::Constant { value } => {
                variables.insert(mapping.var_name.clone(), value.clone());
                input_variables.push(ResolvedVariable {
                    name: mapping.var_name.clone(),
                    value: Some(value.clone()),
                    source_label: "Constant".to_string(),
                });
            }
            MappingSource::StepOutput {
                step_name,
                var_name,
                ..
            } => {
                let resolved = variables.get(var_name).cloned();
                // Write the resolved value into the context under the TARGET name
                // so {{mapping.var_name}} substitution works in URL/headers/body.
                if let Some(ref val) = resolved {
                    variables.insert(mapping.var_name.clone(), val.clone());
                }
                input_variables.push(ResolvedVariable {
                    name: mapping.var_name.clone(),
                    value: resolved,
                    source_label: format!("{step_name} → {var_name}"),
                });
            }
        }
    }
    // Also record any input variables defined on the request that have defaults
    // and weren't explicitly mapped (use the default value if not already in context).
    for iv in &req_def.input_variables {
        let already_mapped = input_variables.iter().any(|r| r.name == iv.name);
        if !already_mapped {
            if let Some(default) = &iv.default_value {
                variables
                    .entry(iv.name.clone())
                    .or_insert_with(|| default.clone());
            }
            let resolved = variables.get(&iv.name).cloned();
            input_variables.push(ResolvedVariable {
                name: iv.name.clone(),
                value: resolved,
                source_label: if variables.contains_key(&iv.name) {
                    "Default".to_string()
                } else {
                    "Unresolved".to_string()
                },
            });
        }
    }
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
        headers_snapshot.push(KeyValue {
            key: kv.key.clone(),
            value: v.clone(),
        });
        if let Ok(name) = reqwest::header::HeaderName::from_bytes(kv.key.as_bytes())
            && let Ok(val) = reqwest::header::HeaderValue::from_str(&v)
        {
            req_builder = req_builder.header(name, val);
        }
    }

    let body_str = req_def
        .body
        .as_deref()
        .map(|b| substitute_vars(b, variables));
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
            input_variables,
            output_variables: vec![],
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

            // Cap response body at 10 MB to prevent OOM on huge responses.
            const MAX_BODY_BYTES: usize = 10 * 1024 * 1024;
            let body_bytes = resp.bytes().await.unwrap_or_default();
            let body = if body_bytes.len() > MAX_BODY_BYTES {
                format!(
                    "[Response body truncated: {} bytes received, limit is {} bytes]",
                    body_bytes.len(),
                    MAX_BODY_BYTES
                )
            } else {
                String::from_utf8_lossy(&body_bytes).into_owned()
            };

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

            // Extract output variables for subsequent steps — always use the request's
            // extract_variables definition so outputs are captured regardless of which
            // test plan this step runs in.
            let body_value: Option<Value> = serde_json::from_str(&body).ok();
            let mut output_variables: Vec<ResolvedVariable> = Vec::new();
            for ev in &req_def.extract_variables {
                let extracted =
                    extract_variable(ev, status_code, &body, &body_value, &resp_headers);
                if let Some(ref val) = extracted {
                    variables.insert(ev.var_name.clone(), val.clone());
                }
                output_variables.push(ResolvedVariable {
                    name: ev.var_name.clone(),
                    value: extracted,
                    source_label: format!(
                        "{} ({})",
                        ev.path,
                        format!("{:?}", ev.source).to_lowercase()
                    ),
                });
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
                input_variables,
                output_variables,
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
            let (p, m) = compare_values(
                &assertion.operator,
                &actual,
                &assertion.expected_value,
                false,
            );
            (actual, p, m)
        }
        AssertionType::BodyContains => {
            let (p, m) = compare_values(&assertion.operator, body, &assertion.expected_value, true);
            (body.chars().take(200).collect(), p, m)
        }
        AssertionType::JsonPath => {
            let target = assertion.target.as_deref().unwrap_or("$");
            let actual = extract_json_path(body, target);
            let (p, m) = compare_values(
                &assertion.operator,
                &actual,
                &assertion.expected_value,
                false,
            );
            (actual, p, m)
        }
        AssertionType::Header => {
            let target = assertion.target.as_deref().unwrap_or("").to_lowercase();
            let header_val = headers
                .iter()
                .find(|h| h.key.to_lowercase() == target)
                .map(|h| h.value.clone())
                .unwrap_or_default();
            let (p, m) = compare_values(
                &assertion.operator,
                &header_val,
                &assertion.expected_value,
                false,
            );
            (header_val, p, m)
        }
        AssertionType::ResponseTime => {
            let actual = duration_ms.to_string();
            let (p, m) = compare_values(
                &assertion.operator,
                &actual,
                &assertion.expected_value,
                false,
            );
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

fn compare_values(
    op: &AssertionOperator,
    actual: &str,
    expected: &str,
    is_body: bool,
) -> (bool, String) {
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
            let snippet = if is_body {
                "body".to_string()
            } else {
                format!("{actual:?}")
            };
            (p, format!("Expected {snippet} to contain {expected:?}"))
        }
        AssertionOperator::NotContains => {
            let p = !actual.contains(expected);
            let snippet = if is_body {
                "body".to_string()
            } else {
                format!("{actual:?}")
            };
            (p, format!("Expected {snippet} to not contain {expected:?}"))
        }
        AssertionOperator::GreaterThan => match (actual.parse::<f64>(), expected.parse::<f64>()) {
            (Ok(a), Ok(e)) => (a > e, format!("Expected {a} > {e}")),
            _ => (
                false,
                format!("Cannot compare non-numeric values: {actual:?} > {expected:?}"),
            ),
        },
        AssertionOperator::LessThan => match (actual.parse::<f64>(), expected.parse::<f64>()) {
            (Ok(a), Ok(e)) => (a < e, format!("Expected {a} < {e}")),
            _ => (
                false,
                format!("Cannot compare non-numeric values: {actual:?} < {expected:?}"),
            ),
        },
        AssertionOperator::Regex => match Regex::new(expected) {
            Ok(re) => {
                let p = re.is_match(actual);
                (
                    p,
                    format!("Expected {actual:?} to match regex {expected:?}"),
                )
            }
            Err(e) => (false, format!("Invalid regex {expected:?}: {e}")),
        },
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
        Err(e) => format!("[JSONPath parse error: {e}]"),
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
            if let Some(val) = body_value
                && let Ok(jp) = JsonPath::parse(&ev.path)
            {
                let nodes = jp.query(val);
                return nodes.first().map(|v| match v {
                    Value::String(s) => s.clone(),
                    other => other.to_string(),
                });
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
