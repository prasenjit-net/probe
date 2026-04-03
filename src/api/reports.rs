use crate::{
    auth::check_session,
    models::{ExecutionReport, ReportSummary},
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

pub async fn list_reports(
    State(state): State<AppState>,
    jar: CookieJar,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    match storage::list::<ExecutionReport>(storage::reports_dir()).await {
        Ok(mut items) => {
            items.sort_by(|a, b| b.started_at.cmp(&a.started_at));
            let summaries: Vec<ReportSummary> = items.iter().map(|r| r.into()).collect();
            Json(summaries).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_report(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    match storage::read::<ExecutionReport>(storage::reports_dir(), &id).await {
        Ok(report) => Json(report).into_response(),
        Err(_) => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Not found"}))).into_response(),
    }
}

pub async fn delete_report(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    if !storage::item_exists(storage::reports_dir(), &id) {
        return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Not found"}))).into_response();
    }
    match storage::delete(storage::reports_dir(), &id).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}
