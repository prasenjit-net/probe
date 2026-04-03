use anyhow::{Context, Result};
use serde::{Serialize, de::DeserializeOwned};
use std::path::PathBuf;
use tokio::fs;

pub fn data_dir() -> PathBuf {
    PathBuf::from("data")
}

pub fn requests_dir() -> PathBuf {
    data_dir().join("requests")
}
pub fn test_plans_dir() -> PathBuf {
    data_dir().join("test_plans")
}
pub fn executions_dir() -> PathBuf {
    data_dir().join("executions")
}
pub fn reports_dir() -> PathBuf {
    data_dir().join("reports")
}

pub async fn ensure_dirs() -> Result<()> {
    for dir in [requests_dir(), test_plans_dir(), executions_dir(), reports_dir()] {
        fs::create_dir_all(&dir).await.with_context(|| format!("create dir {}", dir.display()))?;
    }
    Ok(())
}

pub async fn write<T: Serialize>(dir: PathBuf, id: &str, item: &T) -> Result<()> {
    let path = dir.join(format!("{id}.json"));
    let json = serde_json::to_string_pretty(item)?;
    fs::write(&path, json).await.with_context(|| format!("write {}", path.display()))
}

pub async fn read<T: DeserializeOwned>(dir: PathBuf, id: &str) -> Result<T> {
    let path = dir.join(format!("{id}.json"));
    let bytes = fs::read(&path).await.with_context(|| format!("read {}", path.display()))?;
    serde_json::from_slice(&bytes).with_context(|| format!("parse {}", path.display()))
}

pub async fn list<T: DeserializeOwned + Send>(dir: PathBuf) -> Result<Vec<T>> {
    // Ensure directory exists before trying to read it
    if !dir.exists() {
        fs::create_dir_all(&dir).await?;
        return Ok(vec![]);
    }
    let mut items = Vec::new();
    let mut rd = fs::read_dir(&dir).await?;
    while let Some(entry) = rd.next_entry().await? {
        let path = entry.path();
        if path.extension().map(|e| e == "json").unwrap_or(false) {
            match fs::read(&path).await {
                Ok(bytes) => {
                    if let Ok(item) = serde_json::from_slice::<T>(&bytes) {
                        items.push(item);
                    } else {
                        tracing::warn!("Failed to parse {}", path.display());
                    }
                }
                Err(e) => tracing::warn!("Failed to read {}: {e}", path.display()),
            }
        }
    }
    Ok(items)
}

pub async fn delete(dir: PathBuf, id: &str) -> Result<()> {
    let path = dir.join(format!("{id}.json"));
    fs::remove_file(&path).await.with_context(|| format!("delete {}", path.display()))
}

pub fn item_exists(dir: PathBuf, id: &str) -> bool {
    dir.join(format!("{id}.json")).exists()
}
