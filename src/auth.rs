use crate::state::AppState;
use axum_extra::extract::CookieJar;
use chrono::Utc;

pub const SESSION_COOKIE: &str = "probe_session";

/// Check whether the incoming request carries a valid, non-expired session
/// cookie.  Returns `Some(username)` when authenticated, `None` otherwise.
///
/// Call this at the top of every protected handler instead of relying on Tower
/// middleware (`route_layer` + `from_fn_with_state`), which has known
/// state-propagation issues in axum ≤ 0.8 that silently bypass route matching.
pub fn check_session(state: &AppState, jar: &CookieJar) -> Option<String> {
    let cookie = jar.get(SESSION_COOKIE)?;
    let session = state.sessions.get(cookie.value())?;
    if session.expires_at > Utc::now() {
        Some(session.username.clone())
    } else {
        None
    }
}
