pub mod auth_routes;
pub mod health;
pub mod metrics_handler;

use crate::{embedded, state::AppState};
use axum::{Router, routing::{get, post}};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

/// Build the complete Axum application.
///
/// All routes live on a single flat router — no nesting, no sub-router merges,
/// no `route_layer`.  Auth is enforced inside each handler via `check_session`.
pub fn create_router(state: AppState) -> Router {
    Router::new()
        // ── API: protected (auth checked inside handler) ──────────────────────
        .route("/api/health",          get(health::health_check))
        .route("/api/metrics/summary", get(metrics_handler::metrics_summary))
        .route("/api/auth/me",         get(auth_routes::me_handler))
        .route("/api/auth/logout",     post(auth_routes::logout_handler))
        // ── API: public ───────────────────────────────────────────────────────
        .route("/api/auth/login",      post(auth_routes::login_handler))
        .route("/metrics",             get(metrics_handler::prometheus_scrape))
        // ── SPA fallback ──────────────────────────────────────────────────────
        .fallback(embedded::serve_static)
        // ── Global layers ─────────────────────────────────────────────────────
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        // ── Provide state to all handlers ─────────────────────────────────────
        .with_state(state)
}