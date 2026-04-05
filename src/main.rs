mod ai_generator;
mod api;
mod auth;
mod config;
mod embedded;
mod executor;
mod models;
mod pdf_generator;
mod state;
mod storage;

use std::net::SocketAddr;
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // ── Load configuration ────────────────────────────────────────────────
    let cfg = config::load_config("config.toml")?;

    // ── Initialise structured logging ─────────────────────────────────────
    tracing_subscriber::registry()
        .with(EnvFilter::new(&cfg.logging.level))
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!(app = %cfg.app.name, version = env!("CARGO_PKG_VERSION"), "Starting");

    // ── Ensure data directories exist ─────────────────────────────────────
    storage::ensure_dirs().await?;

    // ── Migrate legacy per-file executions → single-file format ──────────
    if let Err(e) = storage::migrate_executions::<models::Execution>().await {
        tracing::warn!("Execution migration warning: {e}");
    }

    // ── Build shared application state ────────────────────────────────────
    let state = state::AppState::new(cfg.clone());

    // ── Spawn background execution engine ─────────────────────────────────
    executor::spawn(state.clone());

    // ── Build Axum router ─────────────────────────────────────────────────
    let app = api::create_router(state);

    // ── Bind & serve ──────────────────────────────────────────────────────
    let addr: SocketAddr = format!("{}:{}", cfg.server.host, cfg.server.port).parse()?;
    tracing::info!(%addr, "Listening");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
