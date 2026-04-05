//! API handlers for OpenAPI specification management.
//!
//! POST   /api/specs                   – upload JSON/YAML spec (multipart)
//! GET    /api/specs                   – list all specs
//! GET    /api/specs/{id}              – get spec detail
//! DELETE /api/specs/{id}              – delete spec
//! POST   /api/specs/{id}/generate     – AI-generate requests + plan (preview only)
//! POST   /api/specs/{id}/import       – save the reviewed generation preview

use crate::{
    ai_generator,
    auth::check_session,
    models::{
        Collection, GenerationPreview, HttpRequest, MappingSource, MappingSourcePreview,
        SpecRecord, SpecSummary, TestPlan, TestPlanStep,
    },
    state::AppState,
    storage,
};
use axum::{
    Json,
    extract::{Multipart, Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use axum_extra::extract::CookieJar;
use chrono::Utc;
use serde_json::Value;
use uuid::Uuid;

// ── Upload spec ───────────────────────────────────────────────────────────────

pub async fn upload_spec(
    State(state): State<AppState>,
    jar: CookieJar,
    mut multipart: Multipart,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }

    let mut spec_name = String::new();
    let mut file_bytes: Option<Vec<u8>> = None;
    let mut filename = String::new();

    while let Ok(Some(field)) = multipart.next_field().await {
        match field.name().unwrap_or("") {
            "name" => {
                spec_name = field.text().await.unwrap_or_default();
            }
            "file" => {
                filename = field.file_name().unwrap_or("spec.json").to_string();
                file_bytes = field.bytes().await.ok().map(|b| b.to_vec());
            }
            _ => {}
        }
    }

    let bytes = match file_bytes {
        Some(b) => b,
        None => return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error":"No file uploaded"}))).into_response(),
    };

    if spec_name.trim().is_empty() {
        spec_name = filename
            .trim_end_matches(".yaml")
            .trim_end_matches(".yml")
            .trim_end_matches(".json")
            .to_string();
        if spec_name.is_empty() {
            spec_name = "Unnamed Spec".to_string();
        }
    }

    let text = match String::from_utf8(bytes) {
        Ok(s) => s,
        Err(_) => return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error":"File is not valid UTF-8"}))).into_response(),
    };

    // Parse JSON or YAML → normalize to serde_json::Value
    let content: Value = if filename.ends_with(".yaml") || filename.ends_with(".yml") {
        match serde_yaml::from_str::<serde_yaml::Value>(&text) {
            Ok(yv) => match serde_json::to_string(&yv).and_then(|s| serde_json::from_str(&s)) {
                Ok(jv) => jv,
                Err(e) => return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": format!("YAML→JSON conversion failed: {e}")}))).into_response(),
            },
            Err(e) => return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": format!("Invalid YAML: {e}")}))).into_response(),
        }
    } else {
        match serde_json::from_str::<Value>(&text) {
            Ok(v) => v,
            Err(e) => return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": format!("Invalid JSON: {e}")}))).into_response(),
        }
    };

    // Validate OpenAPI 3.x
    if let Err(e) = validate_openapi(&content) {
        return (StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({"error": e}))).into_response();
    }

    let endpoint_count = count_endpoints(&content);

    let record = SpecRecord {
        id: Uuid::new_v4().to_string(),
        name: spec_name,
        created_at: Utc::now(),
        endpoint_count,
        content,
    };

    match storage::write(storage::specs_dir(), &record.id, &record).await {
        Ok(_) => (StatusCode::CREATED, Json(SpecSummary::from(&record))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

// ── List specs ────────────────────────────────────────────────────────────────

pub async fn list_specs(
    State(state): State<AppState>,
    jar: CookieJar,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    match storage::list::<SpecRecord>(storage::specs_dir()).await {
        Ok(mut items) => {
            items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
            let summaries: Vec<SpecSummary> = items.iter().map(SpecSummary::from).collect();
            Json(summaries).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

// ── Get spec ──────────────────────────────────────────────────────────────────

pub async fn get_spec(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    match storage::read::<SpecRecord>(storage::specs_dir(), &id).await {
        Ok(record) => Json(record).into_response(),
        Err(_) => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Not found"}))).into_response(),
    }
}

// ── Delete spec ───────────────────────────────────────────────────────────────

pub async fn delete_spec(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    if !storage::item_exists(storage::specs_dir(), &id) {
        return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Not found"}))).into_response();
    }
    match storage::delete(storage::specs_dir(), &id).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

// ── Generate tests (AI preview) ───────────────────────────────────────────────

pub async fn generate_tests(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
    body: Option<Json<serde_json::Value>>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }

    let record = match storage::read::<SpecRecord>(storage::specs_dir(), &id).await {
        Ok(r) => r,
        Err(_) => return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Spec not found"}))).into_response(),
    };

    let config = &state.config.openai;
    if !config.is_configured() {
        return (StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({
            "error": "OpenAI API key not configured. Please set api_key in config.toml [openai] section."
        }))).into_response();
    }

    // Extract optional user-supplied customization prompt
    let custom_prompt = body
        .as_ref()
        .and_then(|Json(v)| v.get("custom_prompt"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    tracing::info!(
        spec_id = %record.id,
        custom_prompt = custom_prompt.as_deref().unwrap_or("(none)"),
        "Starting AI generation"
    );

    match ai_generator::generate_from_spec(&record, config, custom_prompt.as_deref()).await {
        Ok(preview) => (StatusCode::OK, Json(preview)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

// ── Import generation (save to library) ──────────────────────────────────────

pub async fn import_generation(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(preview): Json<GenerationPreview>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }

    let now = Utc::now();

    // 0. Create two separate collections — one for requests, one for the plan
    let req_collection_id  = Uuid::new_v4().to_string();
    let plan_collection_id = Uuid::new_v4().to_string();
    let collection_name    = preview.plan_name.clone();
    let description        = format!("AI-generated from OpenAPI spec ({})", preview.spec_id);

    let req_collection = Collection {
        id: req_collection_id.clone(),
        name: collection_name.clone(),
        description: description.clone(),
        color: "indigo".to_string(),
        kind: "request".to_string(),
        created_at: now,
        updated_at: now,
    };
    let plan_collection = Collection {
        id: plan_collection_id.clone(),
        name: collection_name.clone(),
        description: description.clone(),
        color: "indigo".to_string(),
        kind: "plan".to_string(),
        created_at: now,
        updated_at: now,
    };
    for (cid, col) in [(&req_collection_id, &req_collection), (&plan_collection_id, &plan_collection)] {
        if let Err(e) = storage::write(storage::collections_dir(), cid, col).await {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                "error": format!("Failed to create collection: {e}")
            }))).into_response();
        }
    }

    let mut saved_requests: Vec<HttpRequest> = Vec::new();

    // 1. Save each generated request (assigned to the request collection)
    for gen_req in &preview.requests {
        let id = Uuid::new_v4().to_string();
        let req = HttpRequest {
            id: id.clone(),
            name: gen_req.name.clone(),
            description: gen_req.description.clone(),
            method: gen_req.method.clone(),
            url: gen_req.url.clone(),
            headers: gen_req.headers.clone(),
            body: gen_req.body.clone(),
            body_type: gen_req.body_type.clone(),
            assertions: gen_req.assertions.clone(),
            input_variables: gen_req.input_variables.clone(),
            extract_variables: gen_req.extract_variables.clone(),
            collection_id: Some(req_collection_id.clone()),
            created_at: now,
            updated_at: now,
        };
        if let Err(e) = storage::write(storage::requests_dir(), &id, &req).await {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                "error": format!("Failed to save request '{}': {}", gen_req.name, e)
            }))).into_response();
        }
        saved_requests.push(req);
    }

    // 2. Build test plan steps, resolving step_index → step UUID
    // First create step IDs for all steps upfront so we can resolve forward (though we forbid forward refs)
    let step_ids: Vec<String> = (0..preview.plan_steps.len()).map(|_| Uuid::new_v4().to_string()).collect();

    // Build name → saved request map
    let req_by_name: std::collections::HashMap<_, _> = saved_requests
        .iter()
        .map(|r| (r.name.as_str(), r))
        .collect();

    let mut plan_steps: Vec<TestPlanStep> = Vec::new();
    for (step_idx, ps) in preview.plan_steps.iter().enumerate() {
        let req = match req_by_name.get(ps.request_name.as_str()) {
            Some(r) => *r,
            None => continue, // skip if request not found
        };

        // Resolve variable mappings
        let variable_mappings: Vec<crate::models::VariableMapping> = ps
            .variable_mappings
            .iter()
            .filter_map(|vm| {
                let source = match &vm.source {
                    MappingSourcePreview::Constant { value } => {
                        MappingSource::Constant { value: value.clone() }
                    }
                    MappingSourcePreview::StepOutput { step_index, var_name } => {
                        // Validate: step_index must reference a previous step
                        if *step_index >= step_idx {
                            tracing::warn!(
                                "Ignoring forward reference in step {} → step_index {}",
                                step_idx, step_index
                            );
                            return None;
                        }
                        let ref_step_id = step_ids[*step_index].clone();
                        let ref_step_name = preview.plan_steps[*step_index].step_name.clone();
                        MappingSource::StepOutput {
                            step_id:   ref_step_id,
                            step_name: ref_step_name,
                            var_name:  var_name.clone(),
                        }
                    }
                };
                Some(crate::models::VariableMapping {
                    var_name: vm.var_name.clone(),
                    source,
                })
            })
            .collect();

        plan_steps.push(TestPlanStep {
            id: step_ids[step_idx].clone(),
            request_id: req.id.clone(),
            name: ps.step_name.clone(),
            enabled: true,
            extract_variables: req.extract_variables.clone(),
            variable_mappings,
        });
    }

    // 3. Save test plan (assigned to the plan collection)
    let plan_id = Uuid::new_v4().to_string();
    let plan = TestPlan {
        id: plan_id.clone(),
        name: preview.plan_name.clone(),
        description: preview.plan_description.clone(),
        collection_id: Some(plan_collection_id.clone()),
        steps: plan_steps,
        created_at: now,
        updated_at: now,
    };

    if let Err(e) = storage::write(storage::test_plans_dir(), &plan_id, &plan).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
            "error": format!("Failed to save test plan: {e}")
        }))).into_response();
    }

    (StatusCode::CREATED, Json(serde_json::json!({
        "requests_created": saved_requests.len(),
        "test_plan_id": plan_id,
        "test_plan_name": plan.name,
        "req_collection_id": req_collection_id,
        "plan_collection_id": plan_collection_id,
        "collection_name": collection_name,
    }))).into_response()
}

// ── Validation helpers ────────────────────────────────────────────────────────

fn validate_openapi(content: &Value) -> Result<(), String> {
    // Check openapi version field
    let version = content
        .get("openapi")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'openapi' version field. Must be an OpenAPI 3.x specification.")?;

    if !version.starts_with("3.") {
        return Err(format!(
            "Unsupported OpenAPI version '{version}'. Only OpenAPI 3.x is supported."
        ));
    }

    // Check paths exist and are non-empty
    let paths = content.get("paths").ok_or("Missing 'paths' object")?;
    if paths.as_object().map(|o| o.is_empty()).unwrap_or(true) {
        return Err("The 'paths' object is empty. No endpoints to generate tests for.".to_string());
    }

    Ok(())
}

fn count_endpoints(content: &Value) -> usize {
    let methods = ["get", "post", "put", "patch", "delete", "head", "options"];
    content
        .get("paths")
        .and_then(|p| p.as_object())
        .map(|paths| {
            paths
                .values()
                .map(|path_item| {
                    methods
                        .iter()
                        .filter(|m| path_item.get(*m).is_some())
                        .count()
                })
                .sum()
        })
        .unwrap_or(0)
}
