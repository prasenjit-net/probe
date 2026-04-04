//! AI-powered test generation using OpenAI.
//!
//! Takes an OpenAPI spec, chunks it into per-endpoint units, calls OpenAI for
//! each to produce request definitions, then calls OpenAI again to build an
//! ordered test plan with variable mappings.

use crate::{
    config::OpenAiConfig,
    models::{
        Assertion, AssertionOperator, AssertionType, BodyType, ExtractVariable, GeneratedRequest,
        GenerationPreview, HttpMethod, InputVariable, KeyValue, MappingSourcePreview,
        PlanStepPreview, SpecRecord, VarMappingPreview,
    },
};
use anyhow::{anyhow, bail, Context, Result};
use futures::future::join_all;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::Semaphore;
use uuid::Uuid;

// ── OpenAI request/response shapes ────────────────────────────────────────────

#[derive(Serialize)]
struct OaiRequest<'a> {
    model: &'a str,
    temperature: f64,
    max_tokens: u32,
    messages: Vec<OaiMessage<'a>>,
    response_format: OaiResponseFormat,
}

#[derive(Serialize)]
struct OaiMessage<'a> {
    role: &'a str,
    content: String,
}

#[derive(Serialize)]
struct OaiResponseFormat {
    #[serde(rename = "type")]
    kind: &'static str,
}

#[derive(Deserialize)]
struct OaiResponse {
    choices: Vec<OaiChoice>,
}

#[derive(Deserialize)]
struct OaiChoice {
    message: OaiChoiceMessage,
}

#[derive(Deserialize)]
struct OaiChoiceMessage {
    content: String,
}

// ── Endpoint unit extracted from spec ─────────────────────────────────────────

#[derive(Debug, Clone)]
struct EndpointSpec {
    path: String,
    method: String,
    summary: String,
    description: String,
    parameters: Vec<Value>,
    request_body: Option<Value>,
    responses: Value,
    base_url: String,
}

// ── System prompts ─────────────────────────────────────────────────────────────

const REQUEST_SYSTEM_PROMPT: &str = r#"You are a precise API test generator. Generate a single test request for the given OpenAPI endpoint.
Output ONLY a valid JSON object. No markdown fences, no explanation, no prose.

Required JSON schema:
{
  "name": "string - short descriptive name",
  "description": "string",
  "method": "GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS",
  "url": "string - full URL, use {{varName}} for path/query params that need variable substitution",
  "headers": [{"key": "string", "value": "string"}],
  "body": "string|null - JSON string for request body, null if no body",
  "body_type": "json|text|form_url_encoded|none",
  "assertions": [
    {
      "type": "status_code|body_contains|json_path|header|response_time",
      "operator": "equals|not_equals|contains|not_contains|greater_than|less_than|regex",
      "target": "string|null - header name or $.jsonpath (null for status_code/body_contains/response_time)",
      "expected_value": "string"
    }
  ],
  "input_variables": [
    {"name": "string", "description": "string", "default_value": "string"}
  ],
  "extract_variables": [
    {"var_name": "string", "path": "$.jsonpath", "source": "response_body"}
  ]
}

Rules:
- Always add a status_code assertion for the primary success HTTP status code (e.g. 200, 201)
- For path parameters like {id} or {userId}: use {{id}} or {{userId}} in the URL and add a matching input_variable
- For POST/PUT bodies: generate a realistic example body as a JSON string
- extract_variables: extract ID fields and tokens from the response schema using JSONPath ($.id, $.token etc.)
- input_variables default_value must be a realistic sample (e.g. "1" for IDs, "john@example.com" for emails)
- Keep headers minimal - add Content-Type: application/json for POST/PUT/PATCH with JSON body
- Do NOT include Authorization headers (these will be added by variable mappings)"#;

const PLAN_SYSTEM_PROMPT: &str = r#"You are a test plan architect. Given a list of API test requests, create an ordered test execution plan.
Output ONLY a valid JSON object. No markdown, no explanation.

Required JSON schema:
{
  "name": "string - descriptive test plan name",
  "description": "string",
  "steps": [
    {
      "request_name": "string - MUST exactly match a name from the provided requests list",
      "step_name": "string - display name for this step",
      "variable_mappings": [
        {
          "var_name": "string - must match an input_variable name in this request",
          "source": {"kind": "constant", "value": "string"}
        },
        {
          "var_name": "string",
          "source": {"kind": "step_output", "step_index": 0, "var_name": "string - extract_variable var_name from that step"}
        }
      ]
    }
  ]
}

Rules:
- Order steps logically: LIST/GET-all first, then CREATE, then GET-by-id (using created ID), then UPDATE, then DELETE
- Use step_output when a request needs an ID or token extracted from a previous step
- step_index is 0-based, must reference a PREVIOUS step only (no forward references)
- Use constant for initial/seed values
- Only map input_variables that actually exist in the request
- If a request has no input_variables, variable_mappings must be []
- Only include a step_name that makes sense for the test flow"#;

// ── Public interface ───────────────────────────────────────────────────────────

/// Generate a `GenerationPreview` from a stored spec using the OpenAI API.
///
/// `custom_prompt` is an optional free-text instruction the user provides to
/// influence generation (e.g. "focus on error cases", "use bearer token auth").
pub async fn generate_from_spec(
    spec: &SpecRecord,
    config: &OpenAiConfig,
    custom_prompt: Option<&str>,
) -> Result<GenerationPreview> {
    if !config.is_configured() {
        bail!("OpenAI API key is not configured. Set api_key in config.toml [openai] section.");
    }

    let endpoints = extract_endpoints(spec)?;
    tracing::info!(spec_id = %spec.id, count = endpoints.len(), "Generating tests for endpoints");

    // Build the custom-prompt suffix once (empty string if none)
    let custom_suffix: Arc<String> = Arc::new(
        custom_prompt
            .map(|p| p.trim().to_string())
            .filter(|p| !p.is_empty())
            .map(|p| format!("\n\nAdditional instructions from the user:\n{p}"))
            .unwrap_or_default(),
    );

    // Parallel per-endpoint calls with max 3 concurrent
    let semaphore = Arc::new(Semaphore::new(3));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()?;
    let client = Arc::new(client);

    let tasks: Vec<_> = endpoints
        .iter()
        .enumerate()
        .map(|(i, ep)| {
            let sem    = semaphore.clone();
            let c      = client.clone();
            let cfg    = config.clone();
            let ep     = ep.clone();
            let suffix = custom_suffix.clone();
            async move {
                let _permit = sem.acquire().await.expect("semaphore closed");
                let result = generate_request_for_endpoint(&c, &cfg, &ep, &suffix).await;
                match &result {
                    Ok(_) => tracing::info!(i, path = %ep.path, method = %ep.method, "Generated"),
                    Err(e) => tracing::warn!(i, path = %ep.path, method = %ep.method, "Failed: {e}"),
                }
                result
            }
        })
        .collect();

    let results = join_all(tasks).await;

    // Collect successful requests; skip failures
    let requests: Vec<GeneratedRequest> = results.into_iter().filter_map(|r| r.ok()).collect();
    if requests.is_empty() {
        bail!("No requests could be generated. Check your API key and spec validity.");
    }

    // Generate the test plan
    let plan = generate_plan(&client, config, &requests, &custom_suffix).await?;

    Ok(GenerationPreview {
        spec_id: spec.id.clone(),
        requests,
        plan_name: plan.name,
        plan_description: plan.description,
        plan_steps: plan.steps,
    })
}

// ── Spec parsing ──────────────────────────────────────────────────────────────

fn extract_endpoints(spec: &SpecRecord) -> Result<Vec<EndpointSpec>> {
    let content = &spec.content;

    // Extract base URL from servers[0].url
    let base_url = content
        .get("servers")
        .and_then(|s| s.as_array())
        .and_then(|arr| arr.first())
        .and_then(|s| s.get("url"))
        .and_then(|u| u.as_str())
        .unwrap_or("")
        .trim_end_matches('/')
        .to_string();

    let paths = content
        .get("paths")
        .and_then(|p| p.as_object())
        .ok_or_else(|| anyhow!("spec has no 'paths' object"))?;

    let mut endpoints = Vec::new();
    for (path, path_item) in paths {
        let path_item_obj = match path_item.as_object() {
            Some(o) => o,
            None => continue,
        };

        // Collect path-level parameters
        let path_params: Vec<Value> = path_item_obj
            .get("parameters")
            .and_then(|p| p.as_array())
            .cloned()
            .unwrap_or_default();

        for method in ["get", "post", "put", "patch", "delete", "head", "options"] {
            let Some(op) = path_item_obj.get(method) else { continue };

            let summary = op
                .get("summary")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let description = op
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            // Merge path + operation parameters
            let mut parameters = path_params.clone();
            if let Some(op_params) = op.get("parameters").and_then(|p| p.as_array()) {
                parameters.extend_from_slice(op_params);
            }

            let request_body = op.get("requestBody").cloned();
            let responses = op.get("responses").cloned().unwrap_or(Value::Null);

            endpoints.push(EndpointSpec {
                path: path.clone(),
                method: method.to_uppercase(),
                summary,
                description,
                parameters,
                request_body,
                responses,
                base_url: base_url.clone(),
            });
        }
    }

    Ok(endpoints)
}

// ── Per-endpoint request generation ───────────────────────────────────────────

async fn generate_request_for_endpoint(
    client: &reqwest::Client,
    config: &OpenAiConfig,
    ep: &EndpointSpec,
    custom_suffix: &str,
) -> Result<GeneratedRequest> {
    let endpoint_json = serde_json::json!({
        "path": ep.path,
        "method": ep.method,
        "base_url": ep.base_url,
        "summary": ep.summary,
        "description": ep.description,
        "parameters": ep.parameters,
        "requestBody": ep.request_body,
        "responses": ep.responses,
    });

    let user_content = format!(
        "Generate a test request for this OpenAPI endpoint:\n\n{}{}",
        serde_json::to_string_pretty(&endpoint_json)?,
        custom_suffix,
    );

    let raw = call_openai(client, config, REQUEST_SYSTEM_PROMPT, &user_content).await?;

    // Parse and validate — retry once on failure
    match parse_generated_request(&raw) {
        Ok(r) => Ok(r),
        Err(e) => {
            tracing::warn!("First parse failed ({e}), retrying…");
            let retry_raw = call_openai(client, config, REQUEST_SYSTEM_PROMPT, &user_content).await?;
            parse_generated_request(&retry_raw)
                .context("Failed to parse AI response after retry")
        }
    }
}

fn parse_generated_request(raw: &str) -> Result<GeneratedRequest> {
    // Strip any accidental markdown fences
    let cleaned = strip_fences(raw);
    let v: Value = serde_json::from_str(&cleaned).context("not valid JSON")?;

    let name = str_field(&v, "name")?;
    let description = v["description"].as_str().unwrap_or("").to_string();
    let method_str = str_field(&v, "method")?;
    let method = parse_method(&method_str)?;
    let url = str_field(&v, "url")?;
    let body_type_str = v["body_type"].as_str().unwrap_or("none").to_string();
    let body_type = parse_body_type(&body_type_str);
    let body = v["body"].as_str().filter(|s| !s.is_empty()).map(|s| s.to_string());

    let headers: Vec<KeyValue> = v["headers"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|h| {
            Some(KeyValue {
                key: h["key"].as_str()?.to_string(),
                value: h["value"].as_str()?.to_string(),
            })
        })
        .collect();

    let assertions: Vec<Assertion> = v["assertions"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|a| parse_assertion(a))
        .collect();

    let input_variables: Vec<InputVariable> = v["input_variables"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|iv| {
            Some(InputVariable {
                name: iv["name"].as_str()?.to_string(),
                description: iv["description"].as_str().unwrap_or("").to_string(),
                default_value: iv["default_value"].as_str().map(|s| s.to_string()),
            })
        })
        .collect();

    let extract_variables: Vec<ExtractVariable> = v["extract_variables"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|ev| {
            Some(ExtractVariable {
                var_name: ev["var_name"].as_str()?.to_string(),
                path: ev["path"].as_str()?.to_string(),
                source: crate::models::VariableSource::ResponseBody,
            })
        })
        .collect();

    Ok(GeneratedRequest {
        name,
        description,
        method,
        url,
        headers,
        body,
        body_type,
        assertions,
        input_variables,
        extract_variables,
    })
}

// ── Plan generation ────────────────────────────────────────────────────────────

struct PlanOutput {
    name: String,
    description: String,
    steps: Vec<PlanStepPreview>,
}

async fn generate_plan(
    client: &reqwest::Client,
    config: &OpenAiConfig,
    requests: &[GeneratedRequest],
    custom_suffix: &str,
) -> Result<PlanOutput> {
    let requests_summary: Vec<Value> = requests
        .iter()
        .map(|r| {
            serde_json::json!({
                "name": r.name,
                "method": format!("{}", r.method),
                "url": r.url,
                "input_variables": r.input_variables.iter().map(|iv| &iv.name).collect::<Vec<_>>(),
                "extract_variables": r.extract_variables.iter().map(|ev| &ev.var_name).collect::<Vec<_>>(),
            })
        })
        .collect();

    let user_content = format!(
        "Create an ordered test execution plan for these API requests:\n\n{}{}",
        serde_json::to_string_pretty(&requests_summary)?,
        custom_suffix,
    );

    let raw = call_openai(client, config, PLAN_SYSTEM_PROMPT, &user_content).await?;
    match parse_plan(&raw, requests) {
        Ok(p) => Ok(p),
        Err(e) => {
            tracing::warn!("Plan parse failed ({e}), retrying…");
            let retry = call_openai(client, config, PLAN_SYSTEM_PROMPT, &user_content).await?;
            parse_plan(&retry, requests).context("Plan generation failed after retry")
        }
    }
}

fn parse_plan(raw: &str, requests: &[GeneratedRequest]) -> Result<PlanOutput> {
    let cleaned = strip_fences(raw);
    let v: Value = serde_json::from_str(&cleaned).context("plan: not valid JSON")?;

    let name = v["name"].as_str().unwrap_or("Generated Test Plan").to_string();
    let description = v["description"].as_str().unwrap_or("").to_string();

    // Build a name→index map for validation
    let name_map: std::collections::HashMap<_, _> = requests
        .iter()
        .enumerate()
        .map(|(i, r)| (r.name.as_str(), i))
        .collect();

    let steps: Vec<PlanStepPreview> = v["steps"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|s| {
            let request_name = s["request_name"].as_str()?.to_string();
            // Validate request exists
            let _ = name_map.get(request_name.as_str())?;
            let step_name = s["step_name"].as_str().unwrap_or(&request_name).to_string();

            let variable_mappings: Vec<VarMappingPreview> = s["variable_mappings"]
                .as_array()
                .unwrap_or(&vec![])
                .iter()
                .filter_map(|m| parse_var_mapping_preview(m))
                .collect();

            Some(PlanStepPreview {
                request_name,
                step_name,
                variable_mappings,
            })
        })
        .collect();

    Ok(PlanOutput { name, description, steps })
}

fn parse_var_mapping_preview(v: &Value) -> Option<VarMappingPreview> {
    let var_name = v["var_name"].as_str()?.to_string();
    let source = &v["source"];
    let kind = source["kind"].as_str()?;
    let source = match kind {
        "constant" => MappingSourcePreview::Constant {
            value: source["value"].as_str().unwrap_or("").to_string(),
        },
        "step_output" => MappingSourcePreview::StepOutput {
            step_index: source["step_index"].as_u64()? as usize,
            var_name: source["var_name"].as_str()?.to_string(),
        },
        _ => return None,
    };
    Some(VarMappingPreview { var_name, source })
}

// ── OpenAI HTTP client ─────────────────────────────────────────────────────────

async fn call_openai(
    client: &reqwest::Client,
    config: &OpenAiConfig,
    system: &str,
    user: &str,
) -> Result<String> {
    let body = OaiRequest {
        model: &config.model,
        temperature: config.temperature,
        max_tokens: config.max_tokens,
        messages: vec![
            OaiMessage { role: "system", content: system.to_string() },
            OaiMessage { role: "user",   content: user.to_string() },
        ],
        response_format: OaiResponseFormat { kind: "json_object" },
    };

    let resp = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(&config.api_key)
        .json(&body)
        .send()
        .await
        .context("OpenAI request failed")?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        bail!("OpenAI API error {status}: {text}");
    }

    let parsed: OaiResponse = resp.json().await.context("parse OpenAI response")?;
    let content = parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .ok_or_else(|| anyhow!("OpenAI returned no choices"))?;

    tracing::debug!(content = %&content[..content.len().min(200)], "OpenAI response");
    Ok(content)
}

// ── Helpers ────────────────────────────────────────────────────────────────────

fn strip_fences(s: &str) -> String {
    let s = s.trim();
    // Strip ```json ... ``` or ``` ... ```
    if let Some(inner) = s.strip_prefix("```json").or_else(|| s.strip_prefix("```")) {
        if let Some(inner) = inner.strip_suffix("```") {
            return inner.trim().to_string();
        }
    }
    s.to_string()
}

fn str_field(v: &Value, key: &str) -> Result<String> {
    v[key]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| anyhow!("missing/non-string field '{key}'"))
}

fn parse_method(s: &str) -> Result<HttpMethod> {
    match s.to_uppercase().as_str() {
        "GET"     => Ok(HttpMethod::Get),
        "POST"    => Ok(HttpMethod::Post),
        "PUT"     => Ok(HttpMethod::Put),
        "PATCH"   => Ok(HttpMethod::Patch),
        "DELETE"  => Ok(HttpMethod::Delete),
        "HEAD"    => Ok(HttpMethod::Head),
        "OPTIONS" => Ok(HttpMethod::Options),
        other     => bail!("unknown method '{other}'"),
    }
}

fn parse_body_type(s: &str) -> BodyType {
    match s {
        "json"             => BodyType::Json,
        "text"             => BodyType::Text,
        "form_url_encoded" => BodyType::FormUrlEncoded,
        _                  => BodyType::None,
    }
}

fn parse_assertion(v: &Value) -> Option<Assertion> {
    let type_str = v["type"].as_str()?;
    let op_str   = v["operator"].as_str()?;

    let assertion_type = match type_str {
        "status_code"    => AssertionType::StatusCode,
        "body_contains"  => AssertionType::BodyContains,
        "json_path"      => AssertionType::JsonPath,
        "header"         => AssertionType::Header,
        "response_time"  => AssertionType::ResponseTime,
        _ => return None,
    };

    let operator = match op_str {
        "equals"       => AssertionOperator::Equals,
        "not_equals"   => AssertionOperator::NotEquals,
        "contains"     => AssertionOperator::Contains,
        "not_contains" => AssertionOperator::NotContains,
        "greater_than" => AssertionOperator::GreaterThan,
        "less_than"    => AssertionOperator::LessThan,
        "regex"        => AssertionOperator::Regex,
        _ => return None,
    };

    Some(Assertion {
        id: Uuid::new_v4().to_string(),
        assertion_type,
        operator,
        target: v["target"].as_str().map(|s| s.to_string()),
        expected_value: v["expected_value"].as_str().unwrap_or("").to_string(),
    })
}
