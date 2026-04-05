use crate::{
    auth::check_session,
    models::{CreateExecution, Execution, ExecutionStatus, TestPlan},
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
async fn read_all(state: &AppState) -> Vec<Execution> {
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

// ── handlers ──────────────────────────────────────────────────────────────────

pub async fn list_executions(
    State(state): State<AppState>,
    jar: CookieJar,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
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
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    let plan = match storage::read::<TestPlan>(storage::test_plans_dir(), &body.test_plan_id).await {
        Ok(p) => p,
        Err(_) => return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Test plan not found"}))).into_response(),
    };
    let execution = Execution {
        id: Uuid::new_v4().to_string(),
        test_plan_id: plan.id,
        test_plan_name: plan.name,
        status: ExecutionStatus::Queued,
        scheduled_at: body.scheduled_at,
        created_at: Utc::now(),
        started_at: None,
        completed_at: None,
        report_id: None,
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
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    let _lock = state.execution_lock.lock().await;
    let items = read_all(&state).await;
    match items.into_iter().find(|e| e.id == id) {
        Some(e) => Json(e).into_response(),
        None => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Not found"}))).into_response(),
    }
}

pub async fn cancel_execution(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    let _lock = state.execution_lock.lock().await;
    let mut items = read_all(&state).await;
    let pos = items.iter().position(|e| e.id == id);
    let Some(idx) = pos else {
        return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Not found"}))).into_response();
    };
    if items[idx].status != ExecutionStatus::Queued {
        return (StatusCode::CONFLICT, Json(serde_json::json!({"error":"Only queued executions can be cancelled"}))).into_response();
    }
    items[idx].status = ExecutionStatus::Cancelled;
    items[idx].completed_at = Some(Utc::now());
    let updated = items[idx].clone();
    save_all(&state, items).await;
    Json(updated).into_response()
}

pub async fn clear_executions(
    State(state): State<AppState>,
    jar: CookieJar,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    let _lock = state.execution_lock.lock().await;
    // Keep only active entries (queued/running) — don't abort running work.
    let items = read_all(&state).await;
    let active: Vec<Execution> = items.into_iter()
        .filter(|e| matches!(e.status, ExecutionStatus::Queued | ExecutionStatus::Running))
        .collect();
    let removed = {
        let all = storage::read_vec::<Execution>(storage::executions_file()).await.unwrap_or_default();
        all.len().saturating_sub(active.len())
    };
    if let Err(e) = storage::write_vec(storage::executions_file(), &active).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response();
    }
    Json(serde_json::json!({ "cleared": removed })).into_response()
}
