//! CRUD handlers for Collections.
//!
//! GET    /api/collections?kind=request|plan  – list collections for a given kind
//! POST   /api/collections                    – create a collection (body must include kind)
//! GET    /api/collections/{id}               – get a collection
//! PUT    /api/collections/{id}               – update a collection
//! DELETE /api/collections/{id}               – delete a collection + cascade-delete its items

use crate::{
    auth::check_session,
    models::{Collection, CollectionSummary, CreateCollection, HttpRequest, TestPlan},
    state::AppState,
    storage,
};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use axum_extra::extract::CookieJar;
use chrono::Utc;
use serde::Deserialize;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct ListCollectionsQuery {
    pub kind: Option<String>,
}

pub async fn list_collections(
    State(state): State<AppState>,
    jar: CookieJar,
    Query(query): Query<ListCollectionsQuery>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error":"Unauthorized"})),
        )
            .into_response();
    }
    match storage::list::<Collection>(storage::collections_dir()).await {
        Ok(mut items) => {
            if let Some(kind) = &query.kind {
                items.retain(|c| &c.kind == kind);
            }
            items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
            let summaries: Vec<CollectionSummary> = items.iter().map(|c| c.into()).collect();
            Json(summaries).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

pub async fn create_collection(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<CreateCollection>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error":"Unauthorized"})),
        )
            .into_response();
    }
    if body.name.trim().is_empty() {
        return (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(serde_json::json!({"error":"Collection name is required"})),
        )
            .into_response();
    }
    let now = Utc::now();
    let col = Collection {
        id: Uuid::new_v4().to_string(),
        name: body.name.trim().to_string(),
        description: body.description,
        color: body.color,
        kind: body.kind,
        created_at: now,
        updated_at: now,
    };
    match storage::write(storage::collections_dir(), &col.id.clone(), &col).await {
        Ok(_) => (StatusCode::CREATED, Json(col)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

pub async fn get_collection(
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
    match storage::read::<Collection>(storage::collections_dir(), &id).await {
        Ok(col) => Json(col).into_response(),
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error":"Not found"})),
        )
            .into_response(),
    }
}

pub async fn update_collection(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
    Json(body): Json<CreateCollection>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error":"Unauthorized"})),
        )
            .into_response();
    }
    if body.name.trim().is_empty() {
        return (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(serde_json::json!({"error":"Collection name is required"})),
        )
            .into_response();
    }
    let existing = match storage::read::<Collection>(storage::collections_dir(), &id).await {
        Ok(c) => c,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error":"Not found"})),
            )
                .into_response();
        }
    };
    let updated = Collection {
        id: existing.id,
        name: body.name.trim().to_string(),
        description: body.description,
        color: body.color,
        kind: existing.kind, // kind is immutable after creation
        created_at: existing.created_at,
        updated_at: Utc::now(),
    };
    match storage::write(storage::collections_dir(), &updated.id.clone(), &updated).await {
        Ok(_) => Json(updated).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

pub async fn delete_collection(
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
    let col = match storage::read::<Collection>(storage::collections_dir(), &id).await {
        Ok(c) => c,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error":"Not found"})),
            )
                .into_response();
        }
    };

    // Cascade-delete all items belonging to this collection.
    match col.kind.as_str() {
        "plan" => {
            if let Ok(plans) = storage::list::<TestPlan>(storage::test_plans_dir()).await {
                for plan in plans
                    .into_iter()
                    .filter(|p| p.collection_id.as_deref() == Some(&id))
                {
                    let _ = storage::delete(storage::test_plans_dir(), &plan.id).await;
                }
            }
        }
        _ => {
            // "request" (and any legacy kind)
            if let Ok(requests) = storage::list::<HttpRequest>(storage::requests_dir()).await {
                for req in requests
                    .into_iter()
                    .filter(|r| r.collection_id.as_deref() == Some(&id))
                {
                    let _ = storage::delete(storage::requests_dir(), &req.id).await;
                }
            }
        }
    }

    match storage::delete(storage::collections_dir(), &id).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error":"Not found"})),
        )
            .into_response(),
    }
}
