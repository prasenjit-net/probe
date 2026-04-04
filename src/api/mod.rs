pub mod auth_routes;
pub mod executions;
pub mod health;
pub mod metrics_handler;
pub mod reports;
pub mod requests;
pub mod specs;
pub mod test_plans;

use crate::{embedded, state::AppState};
use axum::{Router, routing::{get, post}};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

/// Build the complete Axum application.
///
/// All routes live on a single flat router. Auth is enforced inside each handler
/// via `check_session`.
pub fn create_router(state: AppState) -> Router {
    Router::new()
        // ── Auth ──────────────────────────────────────────────────────────────
        .route("/api/auth/login",  post(auth_routes::login_handler))
        .route("/api/auth/logout", post(auth_routes::logout_handler))
        .route("/api/auth/me",     get(auth_routes::me_handler))
        // ── Health & Metrics ──────────────────────────────────────────────────
        .route("/api/health",          get(health::health_check))
        .route("/api/metrics/summary", get(metrics_handler::metrics_summary))
        .route("/metrics",             get(metrics_handler::prometheus_scrape))
        // ── HTTP Requests library ─────────────────────────────────────────────
        .route("/api/requests",           get(requests::list_requests).post(requests::create_request))
        .route("/api/requests/test-fire", post(requests::test_fire))
        .route("/api/requests/{id}",      get(requests::get_request).put(requests::update_request).delete(requests::delete_request))
        // ── Test Plans ────────────────────────────────────────────────────────
        .route("/api/test-plans",      get(test_plans::list_test_plans).post(test_plans::create_test_plan))
        .route("/api/test-plans/{id}",  get(test_plans::get_test_plan).put(test_plans::update_test_plan).delete(test_plans::delete_test_plan))
        // ── Executions (queue) ────────────────────────────────────────────────
        .route("/api/executions",      get(executions::list_executions).post(executions::enqueue_execution))
        .route("/api/executions/{id}",  get(executions::get_execution).delete(executions::cancel_execution))
        // ── Reports ───────────────────────────────────────────────────────────
        .route("/api/reports",          get(reports::list_reports))
        .route("/api/reports/{id}",     get(reports::get_report).delete(reports::delete_report))
        .route("/api/reports/{id}/pdf", get(reports::export_report_pdf))
        // ── API Specifications ────────────────────────────────────────────────
        .route("/api/specs",               get(specs::list_specs).post(specs::upload_spec))
        .route("/api/specs/import",        post(specs::import_generation))
        .route("/api/specs/{id}",          get(specs::get_spec).delete(specs::delete_spec))
        .route("/api/specs/{id}/generate", post(specs::generate_tests))
        // ── SPA fallback ──────────────────────────────────────────────────────
        .fallback(embedded::serve_static)
        // ── Global layers ─────────────────────────────────────────────────────
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .with_state(state)
}