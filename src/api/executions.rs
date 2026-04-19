use crate::{
    auth::check_session,
    models::{
        CreateExecution, Execution, ExecutionMode, ExecutionStatus, LoadTestConfig, TestPlan,
    },
    state::AppState,
    storage,
};
use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use axum_extra::extract::CookieJar;
use chrono::Utc;
use uuid::Uuid;

// ── helpers ───────────────────────────────────────────────────────────────────

/// Read all executions (must hold execution_lock).
async fn read_all(_state: &AppState) -> Vec<Execution> {
    storage::read_vec::<Execution>(storage::executions_file())
        .await
        .unwrap_or_default()
}

/// Persist executions, trimming old completed entries if over the limit.
/// Active entries (Queued / Running) are never removed.
async fn save_all(state: &AppState, mut items: Vec<Execution>) {
    let max = state.config.app.max_executions;
    // Sort newest-first so we keep the most recent entries.
    items.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    if items.len() > max {
        let mut keep: Vec<Execution> = Vec::with_capacity(max);
        let mut active: Vec<Execution> = Vec::new();
        let mut finished: Vec<Execution> = Vec::new();
        for e in items {
            match e.status {
                ExecutionStatus::Queued | ExecutionStatus::Running => active.push(e),
                _ => finished.push(e),
            }
        }
        // finished is already newest-first; take up to (max - active.len())
        let slots = max.saturating_sub(active.len());
        keep.extend(active);
        keep.extend(finished.into_iter().take(slots));
        keep.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        items = keep;
    }

    if let Err(e) = storage::write_vec(storage::executions_file(), &items).await {
        tracing::error!("Failed to persist executions: {e}");
    }
}

fn validate_load_test_config(cfg: &LoadTestConfig) -> Result<(), &'static str> {
    if cfg.concurrency == 0 {
        return Err("Load-test concurrency must be greater than 0");
    }
    if cfg.duration_seconds.unwrap_or(0) == 0 && cfg.total_iterations.unwrap_or(0) == 0 {
        return Err("Load tests require duration_seconds or total_iterations");
    }
    Ok(())
}

// ── handlers ──────────────────────────────────────────────────────────────────

pub async fn list_executions(State(state): State<AppState>, jar: CookieJar) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error":"Unauthorized"})),
        )
            .into_response();
    }
    let _lock = state.execution_lock.lock().await;
    let mut items = read_all(&state).await;
    items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Json(items).into_response()
}

pub async fn enqueue_execution(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<CreateExecution>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error":"Unauthorized"})),
        )
            .into_response();
    }
    let plan = match storage::read::<TestPlan>(storage::test_plans_dir(), &body.test_plan_id).await
    {
        Ok(p) => p,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error":"Test plan not found"})),
            )
                .into_response();
        }
    };

    match body.mode {
        ExecutionMode::Standard => {
            if body.load_test_config.is_some() {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({"error":"load_test_config is only valid for load_test mode"})),
                )
                    .into_response();
            }
        }
        ExecutionMode::LoadTest => {
            let Some(cfg) = body.load_test_config.as_ref() else {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({"error":"load_test_config is required for load_test mode"})),
                )
                    .into_response();
            };
            if let Err(message) = validate_load_test_config(cfg) {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({"error": message})),
                )
                    .into_response();
            }
        }
    }

    // Optionally resolve the environment name for display purposes
    let environment_name = if let Some(ref env_id) = body.environment_id {
        storage::read::<crate::models::Environment>(storage::environments_dir(), env_id)
            .await
            .ok()
            .map(|e| e.name)
    } else {
        None
    };

    let execution = Execution {
        id: Uuid::new_v4().to_string(),
        test_plan_id: plan.id,
        test_plan_name: plan.name,
        status: ExecutionStatus::Queued,
        mode: body.mode,
        scheduled_at: body.scheduled_at,
        created_at: Utc::now(),
        started_at: None,
        completed_at: None,
        report_id: None,
        environment_id: body.environment_id,
        environment_name,
        load_test_config: body.load_test_config,
    };
    let _lock = state.execution_lock.lock().await;
    let mut items = read_all(&state).await;
    items.push(execution.clone());
    save_all(&state, items).await;
    (StatusCode::CREATED, Json(execution)).into_response()
}

pub async fn get_execution(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error":"Unauthorized"})),
        )
            .into_response();
    }
    let _lock = state.execution_lock.lock().await;
    let items = read_all(&state).await;
    match items.into_iter().find(|e| e.id == id) {
        Some(e) => Json(e).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error":"Not found"})),
        )
            .into_response(),
    }
}

pub async fn cancel_execution(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error":"Unauthorized"})),
        )
            .into_response();
    }
    let _lock = state.execution_lock.lock().await;
    let mut items = read_all(&state).await;
    let pos = items.iter().position(|e| e.id == id);
    let Some(idx) = pos else {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error":"Not found"})),
        )
            .into_response();
    };
    match items[idx].status {
        ExecutionStatus::Queued => {
            items[idx].status = ExecutionStatus::Cancelled;
            items[idx].completed_at = Some(Utc::now());
            let updated = items[idx].clone();
            save_all(&state, items).await;
            Json(updated).into_response()
        }
        ExecutionStatus::Running if items[idx].mode == ExecutionMode::LoadTest => {
            state.request_cancellation(&id);
            Json(items[idx].clone()).into_response()
        }
        _ => (
            StatusCode::CONFLICT,
            Json(serde_json::json!({"error":"Only queued executions or running load tests can be cancelled"})),
        )
            .into_response(),
    }
}

pub async fn clear_executions(State(state): State<AppState>, jar: CookieJar) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error":"Unauthorized"})),
        )
            .into_response();
    }
    let _lock = state.execution_lock.lock().await;
    // Keep only active entries (queued/running) — don't abort running work.
    let items = read_all(&state).await;
    let active: Vec<Execution> = items
        .into_iter()
        .filter(|e| matches!(e.status, ExecutionStatus::Queued | ExecutionStatus::Running))
        .collect();
    let removed = {
        let all = storage::read_vec::<Execution>(storage::executions_file())
            .await
            .unwrap_or_default();
        all.len().saturating_sub(active.len())
    };
    if let Err(e) = storage::write_vec(storage::executions_file(), &active).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response();
    }
    Json(serde_json::json!({ "cleared": removed })).into_response()
}
