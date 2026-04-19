use crate::{
    auth::check_session,
    models::{
        CreateTestPlan, HttpRequest, MoveToCollection, TestPlan, TestPlanStep, TestPlanSummary,
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

fn derive_step_name(step_name: &str, request: &HttpRequest, index: usize) -> String {
    if !step_name.trim().is_empty() {
        return step_name.to_string();
    }
    if !request.name.trim().is_empty() {
        return request.name.clone();
    }
    if !request.url.trim().is_empty() {
        return format!("{:?} {}", request.method, request.url);
    }
    format!("Step {}", index + 1)
}

fn normalize_steps(steps: &[TestPlanStep]) -> Vec<TestPlanStep> {
    steps
        .iter()
        .enumerate()
        .map(|(index, step)| TestPlanStep {
            id: step.id.clone(),
            request: step.request.clone(),
            name: derive_step_name(&step.name, &step.request, index),
            enabled: step.enabled,
            variable_mappings: step.variable_mappings.clone(),
        })
        .collect()
}

pub async fn list_test_plans(State(state): State<AppState>, jar: CookieJar) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error":"Unauthorized"})),
        )
            .into_response();
    }
    match storage::list::<TestPlan>(storage::test_plans_dir()).await {
        Ok(mut items) => {
            items.sort_by_key(|item| std::cmp::Reverse(item.updated_at));
            let summaries: Vec<TestPlanSummary> = items.iter().map(|p| p.into()).collect();
            Json(summaries).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

pub async fn create_test_plan(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<CreateTestPlan>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error":"Unauthorized"})),
        )
            .into_response();
    }
    let steps = normalize_steps(&body.steps);
    let now = Utc::now();
    let plan = TestPlan {
        id: Uuid::new_v4().to_string(),
        name: body.name,
        description: body.description,
        collection_id: body.collection_id,
        steps,
        created_at: now,
        updated_at: now,
    };
    match storage::write(storage::test_plans_dir(), &plan.id.clone(), &plan).await {
        Ok(_) => (StatusCode::CREATED, Json(plan)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

pub async fn get_test_plan(
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
    match storage::read::<TestPlan>(storage::test_plans_dir(), &id).await {
        Ok(plan) => Json(plan).into_response(),
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error":"Not found"})),
        )
            .into_response(),
    }
}

pub async fn update_test_plan(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
    Json(body): Json<CreateTestPlan>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error":"Unauthorized"})),
        )
            .into_response();
    }
    let existing = match storage::read::<TestPlan>(storage::test_plans_dir(), &id).await {
        Ok(p) => p,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error":"Not found"})),
            )
                .into_response();
        }
    };
    let steps = normalize_steps(&body.steps);
    let updated = TestPlan {
        id: existing.id,
        name: body.name,
        description: body.description,
        collection_id: body.collection_id,
        steps,
        created_at: existing.created_at,
        updated_at: Utc::now(),
    };
    match storage::write(storage::test_plans_dir(), &updated.id.clone(), &updated).await {
        Ok(_) => Json(updated).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

pub async fn delete_test_plan(
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
    if !storage::item_exists(storage::test_plans_dir(), &id) {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error":"Not found"})),
        )
            .into_response();
    }
    match storage::delete(storage::test_plans_dir(), &id).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

pub async fn move_test_plan(
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
    let existing = match storage::read::<TestPlan>(storage::test_plans_dir(), &id).await {
        Ok(p) => p,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error":"Not found"})),
            )
                .into_response();
        }
    };
    let updated = TestPlan {
        collection_id: body.collection_id,
        updated_at: Utc::now(),
        ..existing
    };
    match storage::write(storage::test_plans_dir(), &updated.id.clone(), &updated).await {
        Ok(_) => Json(TestPlanSummary::from(&updated)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}
