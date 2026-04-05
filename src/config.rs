use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Config {
    pub server: ServerConfig,
    pub auth: AuthConfig,
    pub session: SessionConfig,
    pub logging: LoggingConfig,
    pub app: AppConfig,
    #[serde(default)]
    pub openai: OpenAiConfig,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AuthConfig {
    pub username: String,
    /// Plain-text password stored in config; hashed with bcrypt at startup.
    pub password: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SessionConfig {
    pub ttl_seconds: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct LoggingConfig {
    pub level: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AppConfig {
    pub name: String,
    /// Maximum number of execution records to retain in the queue.
    /// When exceeded, the oldest *completed/cancelled/failed* entries are pruned.
    /// Active (queued/running) entries are never removed automatically.
    #[serde(default = "default_max_executions")]
    pub max_executions: usize,
}

fn default_max_executions() -> usize {
    20
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct OpenAiConfig {
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(default = "default_temperature")]
    pub temperature: f64,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
}

fn default_model() -> String {
    "gpt-4o-mini".to_string()
}
fn default_temperature() -> f64 {
    0.1
}
fn default_max_tokens() -> u32 {
    2000
}

impl OpenAiConfig {
    pub fn is_configured(&self) -> bool {
        !self.api_key.is_empty()
    }
}

pub fn load_config(path: &str) -> anyhow::Result<Config> {
    let content = fs::read_to_string(path)
        .map_err(|e| anyhow::anyhow!("Failed to read config file '{}': {}", path, e))?;
    let config: Config = toml::from_str(&content)
        .map_err(|e| anyhow::anyhow!("Failed to parse config file '{}': {}", path, e))?;
    Ok(config)
}
