use crate::{
    auth::check_session,
    models::{CreateTestPlan, HttpRequest, TestPlan, TestPlanSummary},
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

pub async fn list_test_plans(
    State(state): State<AppState>,
    jar: CookieJar,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    match storage::list::<TestPlan>(storage::test_plans_dir()).await {
        Ok(mut items) => {
            items.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
            let summaries: Vec<TestPlanSummary> = items.iter().map(|p| p.into()).collect();
            Json(summaries).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn create_test_plan(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<CreateTestPlan>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    // Validate all referenced request IDs exist
    for step in &body.steps {
        if !storage::item_exists(storage::requests_dir(), &step.request_id) {
            return (
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(serde_json::json!({"error": format!("Request '{}' not found", step.request_id)})),
            ).into_response();
        }
    }
    let now = Utc::now();
    let plan = TestPlan {
        id: Uuid::new_v4().to_string(),
        name: body.name,
        description: body.description,
        steps: body.steps,
        created_at: now,
        updated_at: now,
    };
    match storage::write(storage::test_plans_dir(), &plan.id.clone(), &plan).await {
        Ok(_) => (StatusCode::CREATED, Json(plan)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_test_plan(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    match storage::read::<TestPlan>(storage::test_plans_dir(), &id).await {
        Ok(plan) => {
            // Enrich steps with request details
            let mut enriched_steps = Vec::new();
            for step in &plan.steps {
                let req = storage::read::<HttpRequest>(storage::requests_dir(), &step.request_id).await.ok();
                enriched_steps.push(serde_json::json!({
                    "id": step.id,
                    "request_id": step.request_id,
                    "name": step.name,
                    "enabled": step.enabled,
                    "extract_variables": step.extract_variables,
                    "request": req,
                }));
            }
            let response = serde_json::json!({
                "id": plan.id,
                "name": plan.name,
                "description": plan.description,
                "steps": enriched_steps,
                "created_at": plan.created_at,
                "updated_at": plan.updated_at,
            });
            Json(response).into_response()
        }
        Err(_) => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Not found"}))).into_response(),
    }
}

pub async fn update_test_plan(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
    Json(body): Json<CreateTestPlan>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    let existing = match storage::read::<TestPlan>(storage::test_plans_dir(), &id).await {
        Ok(p) => p,
        Err(_) => return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Not found"}))).into_response(),
    };
    // Validate referenced request IDs
    for step in &body.steps {
        if !storage::item_exists(storage::requests_dir(), &step.request_id) {
            return (
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(serde_json::json!({"error": format!("Request '{}' not found", step.request_id)})),
            ).into_response();
        }
    }
    let updated = TestPlan {
        id: existing.id,
        name: body.name,
        description: body.description,
        steps: body.steps,
        created_at: existing.created_at,
        updated_at: Utc::now(),
    };
    match storage::write(storage::test_plans_dir(), &updated.id.clone(), &updated).await {
        Ok(_) => Json(updated).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn delete_test_plan(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    if !storage::item_exists(storage::test_plans_dir(), &id) {
        return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Not found"}))).into_response();
    }
    match storage::delete(storage::test_plans_dir(), &id).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}
