//! CRUD handlers for Collections.
//!
//! GET    /api/collections       – list all collections (sorted by name)
//! POST   /api/collections       – create a collection
//! GET    /api/collections/{id}  – get a collection
//! PUT    /api/collections/{id}  – update a collection
//! DELETE /api/collections/{id}  – delete a collection

use crate::{
    auth::check_session,
    models::{Collection, CollectionSummary, CreateCollection},
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

pub async fn list_collections(
    State(state): State<AppState>,
    jar: CookieJar,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    match storage::list::<Collection>(storage::collections_dir()).await {
        Ok(mut items) => {
            items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
            let summaries: Vec<CollectionSummary> = items.iter().map(|c| c.into()).collect();
            Json(summaries).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn create_collection(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<CreateCollection>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    if body.name.trim().is_empty() {
        return (StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({"error":"Collection name is required"}))).into_response();
    }
    let now = Utc::now();
    let col = Collection {
        id: Uuid::new_v4().to_string(),
        name: body.name.trim().to_string(),
        description: body.description,
        color: body.color,
        created_at: now,
        updated_at: now,
    };
    match storage::write(storage::collections_dir(), &col.id.clone(), &col).await {
        Ok(_) => (StatusCode::CREATED, Json(col)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_collection(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    match storage::read::<Collection>(storage::collections_dir(), &id).await {
        Ok(col) => Json(col).into_response(),
        Err(_) => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Not found"}))).into_response(),
    }
}

pub async fn update_collection(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
    Json(body): Json<CreateCollection>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    if body.name.trim().is_empty() {
        return (StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({"error":"Collection name is required"}))).into_response();
    }
    let existing = match storage::read::<Collection>(storage::collections_dir(), &id).await {
        Ok(c) => c,
        Err(_) => return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Not found"}))).into_response(),
    };
    let updated = Collection {
        id: existing.id,
        name: body.name.trim().to_string(),
        description: body.description,
        color: body.color,
        created_at: existing.created_at,
        updated_at: Utc::now(),
    };
    match storage::write(storage::collections_dir(), &updated.id.clone(), &updated).await {
        Ok(_) => Json(updated).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn delete_collection(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    match storage::delete(storage::collections_dir(), &id).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(_) => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Not found"}))).into_response(),
    }
}
