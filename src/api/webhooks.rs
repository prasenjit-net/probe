use crate::{
    api::executions,
    models::{CreateExecution, Environment, ExecutionMode, TestPlan},
    state::AppState,
    storage,
};
use axum::{
    Json,
    body::Bytes,
    extract::{Query, State},
    http::{HeaderMap, StatusCode, header},
    response::IntoResponse,
};
use chrono::{DateTime, Utc};
use serde_json::json;
use std::collections::HashMap;

const TEST_PLAN_KEYS: &[&str] = &["test_plan", "test_plan_id"];
const ENVIRONMENT_KEYS: &[&str] = &["environment", "environment_id"];
const SCHEDULED_AT_KEYS: &[&str] = &["scheduled_at", "schedule_at"];

pub async fn trigger_webhook(
    State(state): State<AppState>,
    Query(query_params): Query<HashMap<String, String>>,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    let mut params = query_params;

    match parse_form_body(&headers, &body) {
        Ok(form_params) => params.extend(form_params),
        Err((status, message)) => {
            return (status, Json(json!({ "error": message }))).into_response();
        }
    }

    let Some(test_plan_selector) = take_param(&mut params, TEST_PLAN_KEYS) else {
        return (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({"error":"Missing required webhook parameter: test_plan"})),
        )
            .into_response();
    };
    let Some(environment_selector) = take_param(&mut params, ENVIRONMENT_KEYS) else {
        return (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({"error":"Missing required webhook parameter: environment"})),
        )
            .into_response();
    };

    let scheduled_at = match take_param(&mut params, SCHEDULED_AT_KEYS) {
        Some(value) => match DateTime::parse_from_rfc3339(&value) {
            Ok(parsed) => Some(parsed.with_timezone(&Utc)),
            Err(_) => {
                return (
                    StatusCode::UNPROCESSABLE_ENTITY,
                    Json(json!({"error":"scheduled_at must be a valid RFC 3339 timestamp"})),
                )
                    .into_response();
            }
        },
        None => None,
    };

    let plan = match resolve_test_plan(&test_plan_selector).await {
        Ok(plan) => plan,
        Err(response) => return response,
    };
    let environment = match resolve_environment(&environment_selector).await {
        Ok(environment) => environment,
        Err(response) => return response,
    };

    let execution = match executions::create_execution(
        &state,
        CreateExecution {
            test_plan_id: plan.id.clone(),
            mode: ExecutionMode::Standard,
            scheduled_at,
            environment_id: Some(environment.id.clone()),
            environment_overrides: params,
            load_test_config: None,
        },
    )
    .await
    {
        Ok(execution) => execution,
        Err((status, body)) => return (status, body).into_response(),
    };

    (
        StatusCode::CREATED,
        Json(json!({
            "execution_id": execution.id,
            "status": execution.status,
            "test_plan_id": execution.test_plan_id,
            "test_plan_name": execution.test_plan_name,
            "environment_id": execution.environment_id,
            "environment_name": execution.environment_name,
            "scheduled_at": execution.scheduled_at,
            "override_count": execution.environment_overrides.len(),
            "environment_overrides": execution.environment_overrides,
        })),
    )
        .into_response()
}

fn parse_form_body(
    headers: &HeaderMap,
    body: &Bytes,
) -> Result<HashMap<String, String>, (StatusCode, String)> {
    if body.is_empty() {
        return Ok(HashMap::new());
    }

    let Some(content_type) = headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
    else {
        return Err((
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "Webhook POST body requires Content-Type: application/x-www-form-urlencoded".into(),
        ));
    };

    if !content_type
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .eq_ignore_ascii_case("application/x-www-form-urlencoded")
    {
        return Err((
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "Webhook only accepts query parameters or application/x-www-form-urlencoded POST bodies".into(),
        ));
    }

    serde_urlencoded::from_bytes::<HashMap<String, String>>(body).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            "Invalid application/x-www-form-urlencoded body".into(),
        )
    })
}

fn take_param(params: &mut HashMap<String, String>, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        params
            .remove(*key)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    })
}

async fn resolve_test_plan(selector: &str) -> Result<TestPlan, axum::response::Response> {
    if let Ok(plan) = storage::read::<TestPlan>(storage::test_plans_dir(), selector).await {
        return Ok(plan);
    }

    match storage::list::<TestPlan>(storage::test_plans_dir()).await {
        Ok(plans) => plans
            .into_iter()
            .find(|plan| plan.name == selector)
            .ok_or_else(|| {
                (
                    StatusCode::NOT_FOUND,
                    Json(json!({"error":"Test plan not found for webhook trigger"})),
                )
                    .into_response()
            }),
        Err(error) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": error.to_string()})),
        )
            .into_response()),
    }
}

async fn resolve_environment(selector: &str) -> Result<Environment, axum::response::Response> {
    if let Ok(environment) =
        storage::read::<Environment>(storage::environments_dir(), selector).await
    {
        return Ok(environment);
    }

    match storage::list::<Environment>(storage::environments_dir()).await {
        Ok(environments) => environments
            .into_iter()
            .find(|environment| environment.name == selector)
            .ok_or_else(|| {
                (
                    StatusCode::NOT_FOUND,
                    Json(json!({"error":"Environment not found for webhook trigger"})),
                )
                    .into_response()
            }),
        Err(error) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": error.to_string()})),
        )
            .into_response()),
    }
}
