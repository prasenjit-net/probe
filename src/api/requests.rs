use crate::{
    auth::check_session,
    executor,
    models::{
        CreateHttpRequest, Environment, HttpRequest, HttpRequestSummary, MoveToCollection,
        TestFireRequest,
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
use std::collections::HashMap;
use uuid::Uuid;

pub async fn list_requests(State(state): State<AppState>, jar: CookieJar) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error":"Unauthorized"})),
        )
            .into_response();
    }
    match storage::list::<HttpRequest>(storage::requests_dir()).await {
        Ok(mut items) => {
            items.sort_by_key(|item| std::cmp::Reverse(item.updated_at));
            let summaries: Vec<HttpRequestSummary> = items.iter().map(|r| r.into()).collect();
            Json(summaries).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

pub async fn create_request(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<CreateHttpRequest>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error":"Unauthorized"})),
        )
            .into_response();
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
        extract_variables: body.extract_variables,
        collection_id: body.collection_id,
        created_at: now,
        updated_at: now,
    };
    match storage::write(storage::requests_dir(), &req.id.clone(), &req).await {
        Ok(_) => (StatusCode::CREATED, Json(req)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

pub async fn get_request(
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
    match storage::read::<HttpRequest>(storage::requests_dir(), &id).await {
        Ok(req) => Json(req).into_response(),
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error":"Not found"})),
        )
            .into_response(),
    }
}

pub async fn update_request(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
    Json(body): Json<CreateHttpRequest>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error":"Unauthorized"})),
        )
            .into_response();
    }
    let existing = match storage::read::<HttpRequest>(storage::requests_dir(), &id).await {
        Ok(r) => r,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error":"Not found"})),
            )
                .into_response();
        }
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
        extract_variables: body.extract_variables,
        collection_id: body.collection_id,
        created_at: existing.created_at,
        updated_at: Utc::now(),
    };
    match storage::write(storage::requests_dir(), &updated.id.clone(), &updated).await {
        Ok(_) => Json(updated).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

pub async fn delete_request(
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
    if !storage::item_exists(storage::requests_dir(), &id) {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error":"Not found"})),
        )
            .into_response();
    }
    match storage::delete(storage::requests_dir(), &id).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// Execute a request payload ad-hoc (no persistence, no report).
/// Used by the Request Designer "Test Fire" button.
pub async fn test_fire(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<TestFireRequest>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error":"Unauthorized"})),
        )
            .into_response();
    }
    let now = Utc::now();
    let req = body.request;
    let req_def = HttpRequest {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        description: req.description,
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body,
        body_type: req.body_type,
        assertions: req.assertions,
        input_variables: req.input_variables,
        extract_variables: req.extract_variables,
        collection_id: req.collection_id,
        created_at: now,
        updated_at: now,
    };
    let http_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_default();
    // Seed variables: environment (lowest) → defaults → user-supplied (highest)
    let mut variables: HashMap<String, String> = HashMap::new();

    // 1. Environment variables (lowest priority)
    if let Some(ref env_id) = body.environment_id {
        match storage::read::<Environment>(storage::environments_dir(), env_id).await {
            Ok(env) => variables.extend(env.variables),
            Err(e) => tracing::warn!("Could not load environment {env_id} for test-fire: {e}"),
        }
    }

    // 2. Input variable defaults
    for iv in &req_def.input_variables {
        if let Some(default) = &iv.default_value
            && !default.is_empty()
        {
            variables
                .entry(iv.name.clone())
                .or_insert_with(|| default.clone());
        }
    }

    // 3. User-supplied overrides (highest priority)
    for (k, v) in body.variable_values {
        if !v.is_empty() {
            variables.insert(k, v);
        }
    }
    let step_id = Uuid::new_v4().to_string();
    let result =
        executor::execute_step(&http_client, &step_id, &req_def, &[], &mut variables).await;
    _ = state;
    Json(result).into_response()
}

pub async fn move_request(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
    Json(body): Json<MoveToCollection>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error":"Unauthorized"})),
        )
            .into_response();
    }
    let existing = match storage::read::<HttpRequest>(storage::requests_dir(), &id).await {
        Ok(r) => r,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error":"Not found"})),
            )
                .into_response();
        }
    };
    let updated = HttpRequest {
        collection_id: body.collection_id,
        updated_at: Utc::now(),
        ..existing
    };
    match storage::write(storage::requests_dir(), &updated.id.clone(), &updated).await {
        Ok(_) => Json(HttpRequestSummary::from(&updated)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}
