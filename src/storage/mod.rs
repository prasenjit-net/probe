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
/// Single-file store for all execution records.
pub fn executions_file() -> PathBuf {
    data_dir().join("executions.json")
}
pub fn reports_dir() -> PathBuf {
    data_dir().join("reports")
}

pub fn collections_dir() -> PathBuf {
    data_dir().join("collections")
}
pub fn specs_dir() -> PathBuf {
    data_dir().join("specs")
}

pub async fn ensure_dirs() -> Result<()> {
    for dir in [requests_dir(), test_plans_dir(), reports_dir(), specs_dir(), collections_dir()] {
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

// ── Single-file array storage (used for executions) ──────────────────────────

/// Read a JSON array from a single file. Returns empty vec if the file doesn't exist.
pub async fn read_vec<T: DeserializeOwned>(path: PathBuf) -> Result<Vec<T>> {
    if !path.exists() {
        return Ok(vec![]);
    }
    let bytes = fs::read(&path).await.with_context(|| format!("read {}", path.display()))?;
    serde_json::from_slice(&bytes).with_context(|| format!("parse {}", path.display()))
}

/// Write a JSON array to a single file atomically (write to .tmp then rename).
pub async fn write_vec<T: Serialize>(path: PathBuf, items: &[T]) -> Result<()> {
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(items)?;
    fs::write(&tmp, json).await.with_context(|| format!("write tmp {}", tmp.display()))?;
    fs::rename(&tmp, &path).await.with_context(|| format!("rename to {}", path.display()))
}

/// Migrate legacy per-file executions (data/executions/*.json) into the new
/// single-file format (data/executions.json). Safe to call repeatedly —
/// only runs if the legacy directory contains files and the new file doesn't exist.
pub async fn migrate_executions<T: DeserializeOwned + Serialize + Send>() -> Result<()> {
    let new_file = executions_file();
    if new_file.exists() {
        return Ok(());  // already migrated
    }
    let legacy_dir = executions_dir();
    if !legacy_dir.exists() {
        return Ok(());
    }
    let items: Vec<T> = list(legacy_dir.clone()).await.unwrap_or_default();
    if items.is_empty() {
        return Ok(());
    }
    tracing::info!("Migrating {} legacy execution file(s) → executions.json", items.len());
    write_vec(new_file, &items).await?;
    // Remove old individual files after successful migration
    if let Ok(mut rd) = fs::read_dir(&legacy_dir).await {
        while let Some(entry) = rd.next_entry().await.unwrap_or(None) {
            let _ = fs::remove_file(entry.path()).await;
        }
    }
    Ok(())
}
