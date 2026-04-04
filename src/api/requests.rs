use crate::{
    auth::check_session,
    models::{CreateHttpRequest, HttpRequest, HttpRequestSummary},
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

pub async fn list_requests(
    State(state): State<AppState>,
    jar: CookieJar,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    match storage::list::<HttpRequest>(storage::requests_dir()).await {
        Ok(mut items) => {
            items.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
            let summaries: Vec<HttpRequestSummary> = items.iter().map(|r| r.into()).collect();
            Json(summaries).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn create_request(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<CreateHttpRequest>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    let now = Utc::now();
    let req = HttpRequest {
        id: Uuid::new_v4().to_string(),
        name: body.name,
        description: body.description,
        method: body.method,
        url: body.url,
        headers: body.headers,
        body: body.body,
        body_type: body.body_type,
        assertions: body.assertions,
        input_variables: body.input_variables,
        created_at: now,
        updated_at: now,
    };
    match storage::write(storage::requests_dir(), &req.id.clone(), &req).await {
        Ok(_) => (StatusCode::CREATED, Json(req)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_request(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    match storage::read::<HttpRequest>(storage::requests_dir(), &id).await {
        Ok(req) => Json(req).into_response(),
        Err(_) => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Not found"}))).into_response(),
    }
}

pub async fn update_request(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
    Json(body): Json<CreateHttpRequest>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    let existing = match storage::read::<HttpRequest>(storage::requests_dir(), &id).await {
        Ok(r) => r,
        Err(_) => return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Not found"}))).into_response(),
    };
    let updated = HttpRequest {
        id: existing.id,
        name: body.name,
        description: body.description,
        method: body.method,
        url: body.url,
        headers: body.headers,
        body: body.body,
        body_type: body.body_type,
        assertions: body.assertions,
        input_variables: body.input_variables,
        created_at: existing.created_at,
        updated_at: Utc::now(),
    };
    match storage::write(storage::requests_dir(), &updated.id.clone(), &updated).await {
        Ok(_) => Json(updated).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn delete_request(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    if !storage::item_exists(storage::requests_dir(), &id) {
        return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Not found"}))).into_response();
    }
    match storage::delete(storage::requests_dir(), &id).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}
