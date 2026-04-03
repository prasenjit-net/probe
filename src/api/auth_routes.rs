use crate::{
    auth::{check_session, SESSION_COOKIE},
    state::{AppState, Session},
};
use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json},
};
use axum_extra::extract::{
    CookieJar,
    cookie::{Cookie, SameSite},
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ── Request / Response types ───────────────────────────────────────────────

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub success: bool,
    pub message: String,
}

// ── Handlers ───────────────────────────────────────────────────────────────

pub async fn login_handler(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(req): Json<LoginRequest>,
) -> impl IntoResponse {
    let username_ok = req.username == state.config.auth.username;
    let password_ok = state.verify_password(&req.password);

    if !username_ok || !password_ok {
        state.counters.inc_login_failure();
        tracing::warn!(username = %req.username, "Failed login attempt");
        return (
            StatusCode::UNAUTHORIZED,
            jar,
            Json(LoginResponse {
                success: false,
                message: "Invalid username or password.".into(),
            }),
        )
            .into_response();
    }

    let session_id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let ttl = chrono::Duration::seconds(state.config.session.ttl_seconds as i64);

    state.sessions.insert(
        session_id.clone(),
        Session {
            username: req.username.clone(),
            created_at: now,
            expires_at: now + ttl,
        },
    );

    state.counters.inc_login_success();
    tracing::info!(username = %req.username, "Successful login");

    let cookie = Cookie::build((SESSION_COOKIE, session_id))
        .http_only(true)
        .same_site(SameSite::Strict)
        .path("/")
        .build();

    (
        StatusCode::OK,
        jar.add(cookie),
        Json(LoginResponse {
            success: true,
            message: "Login successful.".into(),
        }),
    )
        .into_response()
}

pub async fn logout_handler(
    State(state): State<AppState>,
    jar: CookieJar,
) -> impl IntoResponse {
    if let Some(cookie) = jar.get(SESSION_COOKIE) {
        state.sessions.remove(cookie.value());
        tracing::info!("Session removed on logout");
    }
    let removal = Cookie::build((SESSION_COOKIE, "")).path("/").build();
    (
        StatusCode::OK,
        jar.remove(removal),
        Json(serde_json::json!({ "success": true })),
    )
        .into_response()
}

pub async fn me_handler(
    State(state): State<AppState>,
    jar: CookieJar,
) -> impl IntoResponse {
    match check_session(&state, &jar) {
        Some(username) => Json(serde_json::json!({
            "authenticated": true,
            "username": username,
        }))
        .into_response(),
        None => (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "authenticated": false })),
        )
            .into_response(),
    }
}