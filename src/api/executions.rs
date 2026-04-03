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

pub async fn list_executions(
    State(state): State<AppState>,
    jar: CookieJar,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    match storage::list::<Execution>(storage::executions_dir()).await {
        Ok(mut items) => {
            items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
            Json(items).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn enqueue_execution(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<CreateExecution>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    // Load test plan to get its name
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
    match storage::write(storage::executions_dir(), &execution.id.clone(), &execution).await {
        Ok(_) => (StatusCode::CREATED, Json(execution)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_execution(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    match storage::read::<Execution>(storage::executions_dir(), &id).await {
        Ok(ex) => Json(ex).into_response(),
        Err(_) => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Not found"}))).into_response(),
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
    let mut execution = match storage::read::<Execution>(storage::executions_dir(), &id).await {
        Ok(e) => e,
        Err(_) => return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Not found"}))).into_response(),
    };
    if execution.status != ExecutionStatus::Queued {
        return (StatusCode::CONFLICT, Json(serde_json::json!({"error":"Only queued executions can be cancelled"}))).into_response();
    }
    execution.status = ExecutionStatus::Cancelled;
    execution.completed_at = Some(Utc::now());
    match storage::write(storage::executions_dir(), &execution.id.clone(), &execution).await {
        Ok(_) => Json(execution).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}
