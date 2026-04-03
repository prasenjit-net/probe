use crate::{auth::check_session, state::AppState};
use axum::{
    extract::State,
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Json},
};
use axum_extra::extract::CookieJar;
use serde::Serialize;

#[derive(Serialize)]
pub struct MetricsSummary {
    pub requests_total: u64,
    pub login_success_total: u64,
    pub login_failure_total: u64,
    pub active_sessions: usize,
}

/// JSON summary endpoint – consumed by the React dashboard.
pub fn router() -> axum::Router<AppState> {
    use axum::routing::get;
    axum::Router::new().route("/metrics/summary", get(metrics_summary))
}

pub async fn metrics_summary(
    State(state): State<AppState>,
    jar: CookieJar,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    Json(MetricsSummary {
        requests_total: state.counters.requests(),
        login_success_total: state.counters.login_success(),
        login_failure_total: state.counters.login_failure(),
        active_sessions: state.active_sessions(),
    })
    .into_response()
}

/// Prometheus text-format scrape endpoint at `/metrics` (no auth – standard for scraping).
pub async fn prometheus_scrape(State(state): State<AppState>) -> impl IntoResponse {
    let requests        = state.counters.requests();
    let login_success   = state.counters.login_success();
    let login_failure   = state.counters.login_failure();
    let active_sessions = state.active_sessions();

    let body = format!(
        "# HELP probe_requests_total Total requests to protected endpoints.\n\
         # TYPE probe_requests_total counter\n\
         probe_requests_total {requests}\n\
         # HELP probe_login_success_total Successful authentication attempts.\n\
         # TYPE probe_login_success_total counter\n\
         probe_login_success_total {login_success}\n\
         # HELP probe_login_failure_total Failed authentication attempts.\n\
         # TYPE probe_login_failure_total counter\n\
         probe_login_failure_total {login_failure}\n\
         # HELP probe_active_sessions Current active sessions.\n\
         # TYPE probe_active_sessions gauge\n\
         probe_active_sessions {active_sessions}\n"
    );

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/plain; version=0.0.4; charset=utf-8"),
    );
    (headers, body).into_response()
}