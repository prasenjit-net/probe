use crate::config::Config;
use chrono::{DateTime, Utc};
use dashmap::{DashMap, DashSet};
use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};
use tokio::sync::Mutex;

/// Simple in-process counters exposed on the JSON dashboard endpoint.
#[derive(Debug, Default)]
pub struct AppCounters {
    pub requests_total: AtomicU64,
    pub login_success_total: AtomicU64,
    pub login_failure_total: AtomicU64,
}

impl AppCounters {
    pub fn inc_requests(&self) {
        self.requests_total.fetch_add(1, Ordering::Relaxed);
    }
    pub fn inc_login_success(&self) {
        self.login_success_total.fetch_add(1, Ordering::Relaxed);
    }
    pub fn inc_login_failure(&self) {
        self.login_failure_total.fetch_add(1, Ordering::Relaxed);
    }
    pub fn requests(&self) -> u64 {
        self.requests_total.load(Ordering::Relaxed)
    }
    pub fn login_success(&self) -> u64 {
        self.login_success_total.load(Ordering::Relaxed)
    }
    pub fn login_failure(&self) -> u64 {
        self.login_failure_total.load(Ordering::Relaxed)
    }
}

#[derive(Debug, Clone)]
pub struct Session {
    pub username: String,
    #[allow(dead_code)]
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub sessions: Arc<DashMap<String, Session>>,
    pub cancel_requests: Arc<DashSet<String>>,
    /// bcrypt hash of the configured plain-text password.
    pub password_hash: Arc<String>,
    pub start_time: DateTime<Utc>,
    pub counters: Arc<AppCounters>,
    /// Serializes all reads + writes to the executions.json single file.
    pub execution_lock: Arc<Mutex<()>>,
}

impl AppState {
    pub fn new(config: Config) -> Self {
        let hash = bcrypt::hash(&config.auth.password, bcrypt::DEFAULT_COST)
            .expect("Failed to bcrypt-hash the configured password");
        Self {
            config,
            sessions: Arc::new(DashMap::new()),
            cancel_requests: Arc::new(DashSet::new()),
            password_hash: Arc::new(hash),
            start_time: Utc::now(),
            counters: Arc::new(AppCounters::default()),
            execution_lock: Arc::new(Mutex::new(())),
        }
    }

    pub fn verify_password(&self, password: &str) -> bool {
        bcrypt::verify(password, &self.password_hash).unwrap_or(false)
    }

    pub fn active_sessions(&self) -> usize {
        // Prune expired sessions while we're here.
        let now = Utc::now();
        self.sessions.retain(|_, s| s.expires_at > now);
        self.sessions.len()
    }

    pub fn request_cancellation(&self, execution_id: &str) {
        self.cancel_requests.insert(execution_id.to_string());
    }

    pub fn is_cancellation_requested(&self, execution_id: &str) -> bool {
        self.cancel_requests.contains(execution_id)
    }

    pub fn clear_cancellation(&self, execution_id: &str) {
        self.cancel_requests.remove(execution_id);
    }
}
