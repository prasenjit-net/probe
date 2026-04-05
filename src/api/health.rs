use crate::{auth::check_session, state::AppState};
use axum::{extract::State, http::StatusCode, response::IntoResponse, response::Json};
use axum_extra::extract::CookieJar;
use chrono::Utc;
use serde::Serialize;

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub uptime_seconds: i64,
    pub timestamp: String,
    pub app_name: String,
    pub version: &'static str,
}

// Kept for optional standalone use / tests.
#[allow(dead_code)]
pub fn router() -> axum::Router<AppState> {
    use axum::routing::get;
    axum::Router::new().route("/health", get(health_check))
}

pub async fn health_check(State(state): State<AppState>, jar: CookieJar) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let uptime = Utc::now() - state.start_time;
    state.counters.inc_requests();
    Json(HealthResponse {
        status: "ok",
        uptime_seconds: uptime.num_seconds(),
        timestamp: Utc::now().to_rfc3339(),
        app_name: state.config.app.name.clone(),
        version: env!("CARGO_PKG_VERSION"),
    })
    .into_response()
}
