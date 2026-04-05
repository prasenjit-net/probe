use crate::{
    auth::check_session,
    models::Environment,
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
use serde::Deserialize;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct CreateEnvironment {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub variables: std::collections::HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateEnvironment {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub variables: std::collections::HashMap<String, String>,
}

pub async fn list_environments(
    State(state): State<AppState>,
    jar: CookieJar,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return unauthorized();
    }
    match storage::list::<Environment>(storage::environments_dir()).await {
        Ok(mut items) => {
            items.sort_by(|a, b| a.name.cmp(&b.name));
            Json(items).into_response()
        }
        Err(e) => internal_error(e.to_string()),
    }
}

pub async fn create_environment(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<CreateEnvironment>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return unauthorized();
    }
    let now = Utc::now();
    let env = Environment {
        id: Uuid::new_v4().to_string(),
        name: body.name,
        description: body.description,
        variables: body.variables,
        created_at: now,
        updated_at: now,
    };
    match storage::write(storage::environments_dir(), &env.id, &env).await {
        Ok(_) => (StatusCode::CREATED, Json(env)).into_response(),
        Err(e) => internal_error(e.to_string()),
    }
}

pub async fn get_environment(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return unauthorized();
    }
    match storage::read::<Environment>(storage::environments_dir(), &id).await {
        Ok(env) => Json(env).into_response(),
        Err(_) => not_found(),
    }
}

pub async fn update_environment(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
    Json(body): Json<UpdateEnvironment>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return unauthorized();
    }
    let existing = match storage::read::<Environment>(storage::environments_dir(), &id).await {
        Ok(e) => e,
        Err(_) => return not_found(),
    };
    let updated = Environment {
        id: existing.id,
        name: body.name,
        description: body.description,
        variables: body.variables,
        created_at: existing.created_at,
        updated_at: Utc::now(),
    };
    match storage::write(storage::environments_dir(), &updated.id, &updated).await {
        Ok(_) => Json(updated).into_response(),
        Err(e) => internal_error(e.to_string()),
    }
}

pub async fn delete_environment(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return unauthorized();
    }
    if !storage::item_exists(storage::environments_dir(), &id) {
        return not_found();
    }
    match storage::delete(storage::environments_dir(), &id).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => internal_error(e.to_string()),
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn unauthorized() -> axum::response::Response {
    (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response()
}

fn not_found() -> axum::response::Response {
    (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Not found"}))).into_response()
}

fn internal_error(msg: String) -> axum::response::Response {
    (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": msg}))).into_response()
}
