use crate::{auth::check_session, state::AppState, storage};
use axum::{
    Json,
    body::Body,
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode},
    response::IntoResponse,
};
use axum_extra::extract::CookieJar;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::io::{Cursor, Write};
use tokio::fs;

#[derive(Serialize)]
pub struct ArchiveMeta {
    pub name: String,
    pub size_bytes: u64,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct ConfirmQuery {
    pub confirm: Option<bool>,
}

pub async fn list_archives(State(state): State<AppState>, jar: CookieJar) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return unauthorized();
    }

    let dir = storage::archives_dir();
    if !dir.exists() {
        return Json(Vec::<ArchiveMeta>::new()).into_response();
    }

    let mut archives = Vec::new();
    let mut rd = match fs::read_dir(&dir).await {
        Ok(rd) => rd,
        Err(e) => return internal_error(e.to_string()),
    };
    while let Ok(Some(entry)) = rd.next_entry().await {
        let path = entry.path();
        if path.extension().map(|e| e == "zip").unwrap_or(false) {
            let name = match path.file_name() {
                Some(n) => n.to_string_lossy().into_owned(),
                None => continue,
            };
            if let Ok(meta) = fs::metadata(&path).await {
                let created_at = meta
                    .modified()
                    .ok()
                    .map(|t| chrono::DateTime::<Utc>::from(t).to_rfc3339())
                    .unwrap_or_default();
                archives.push(ArchiveMeta {
                    name,
                    size_bytes: meta.len(),
                    created_at,
                });
            }
        }
    }
    archives.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Json(archives).into_response()
}

pub async fn create_archive(State(state): State<AppState>, jar: CookieJar) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return unauthorized();
    }

    let archives_dir = storage::archives_dir();
    if let Err(e) = fs::create_dir_all(&archives_dir).await {
        return internal_error(e.to_string());
    }

    let data_dir = storage::data_dir();
    let timestamp = Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let archive_name = format!("archive_{}.zip", timestamp);
    let archive_path = archives_dir.join(&archive_name);

    let result =
        tokio::task::spawn_blocking(move || collect_and_zip(&data_dir, &archives_dir)).await;

    match result {
        Ok(Ok(bytes)) => {
            let size = bytes.len() as u64;
            if let Err(e) = fs::write(&archive_path, &bytes).await {
                return internal_error(e.to_string());
            }
            Json(ArchiveMeta {
                name: archive_name,
                size_bytes: size,
                created_at: Utc::now().to_rfc3339(),
            })
            .into_response()
        }
        Ok(Err(e)) => internal_error(e.to_string()),
        Err(e) => internal_error(e.to_string()),
    }
}

pub async fn download_archive(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return unauthorized();
    }
    if !is_safe_archive_name(&name) {
        return bad_request("Invalid archive name");
    }

    let path = storage::archives_dir().join(&name);
    if !path.exists() {
        return not_found();
    }

    match fs::read(&path).await {
        Ok(bytes) => {
            let mut headers = HeaderMap::new();
            headers.insert("Content-Type", HeaderValue::from_static("application/zip"));
            let disposition = format!("attachment; filename=\"{}\"", name.replace('"', "\\\""));
            headers.insert(
                "Content-Disposition",
                HeaderValue::from_str(&disposition).unwrap_or_else(|_| {
                    HeaderValue::from_static("attachment; filename=\"archive.zip\"")
                }),
            );
            (headers, Body::from(bytes)).into_response()
        }
        Err(e) => internal_error(e.to_string()),
    }
}

pub async fn restore_archive(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(name): Path<String>,
    Query(query): Query<ConfirmQuery>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return unauthorized();
    }
    if query.confirm != Some(true) {
        return bad_request("Restore requires confirm=true query parameter");
    }
    if !is_safe_archive_name(&name) {
        return bad_request("Invalid archive name");
    }

    let archive_path = storage::archives_dir().join(&name);
    if !archive_path.exists() {
        return not_found();
    }

    let zip_bytes = match fs::read(&archive_path).await {
        Ok(b) => b,
        Err(e) => return internal_error(e.to_string()),
    };

    // Hold the execution lock for the entire clear+extract so no concurrent
    // write can sneak in between the two operations and lose data.
    let _lock = state.execution_lock.lock().await;

    // Clear all existing data (except archives directory)
    let data_dir = storage::data_dir();
    let archives_dir = storage::archives_dir();
    if let Err(e) = clear_data_except_archives(&data_dir, &archives_dir).await {
        return internal_error(format!("Failed to clear existing data: {e}"));
    }

    // Extract zip into data dir
    let data_dir_clone = data_dir.clone();
    match tokio::task::spawn_blocking(move || extract_zip(&zip_bytes, &data_dir_clone)).await {
        Ok(Ok(())) => Json(serde_json::json!({"message": "Restored successfully"})).into_response(),
        Ok(Err(e)) => internal_error(e.to_string()),
        Err(e) => internal_error(e.to_string()),
    }
}

pub async fn delete_archive(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if check_session(&state, &jar).is_none() {
        return unauthorized();
    }
    if !is_safe_archive_name(&name) {
        return bad_request("Invalid archive name");
    }

    let path = storage::archives_dir().join(&name);
    if !path.exists() {
        return not_found();
    }

    match fs::remove_file(&path).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => internal_error(e.to_string()),
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn is_safe_archive_name(name: &str) -> bool {
    !name.contains('/') && !name.contains('\\') && !name.contains("..") && name.ends_with(".zip")
}

fn unauthorized() -> axum::response::Response {
    (
        StatusCode::UNAUTHORIZED,
        Json(serde_json::json!({"error": "Unauthorized"})),
    )
        .into_response()
}

fn internal_error(msg: String) -> axum::response::Response {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({"error": msg})),
    )
        .into_response()
}

fn bad_request(msg: &'static str) -> axum::response::Response {
    (
        StatusCode::BAD_REQUEST,
        Json(serde_json::json!({"error": msg})),
    )
        .into_response()
}

fn not_found() -> axum::response::Response {
    (
        StatusCode::NOT_FOUND,
        Json(serde_json::json!({"error": "Archive not found"})),
    )
        .into_response()
}

/// Walk `data_dir` (excluding `archives_dir`) and compress everything into a
/// zip archive held in memory. Returns the raw bytes.
fn collect_and_zip(
    data_dir: &std::path::Path,
    archives_dir: &std::path::Path,
) -> anyhow::Result<Vec<u8>> {
    let buf = Cursor::new(Vec::new());
    let mut zip = zip::ZipWriter::new(buf);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    add_dir_to_zip(&mut zip, data_dir, data_dir, archives_dir, options)?;

    let result = zip.finish()?;
    Ok(result.into_inner())
}

fn add_dir_to_zip(
    zip: &mut zip::ZipWriter<Cursor<Vec<u8>>>,
    base_dir: &std::path::Path,
    current_dir: &std::path::Path,
    skip_dir: &std::path::Path,
    options: zip::write::SimpleFileOptions,
) -> anyhow::Result<()> {
    for entry in std::fs::read_dir(current_dir)? {
        let entry = entry?;
        let path = entry.path();

        // Skip the archives directory itself
        if path == skip_dir {
            continue;
        }

        let relative = path.strip_prefix(base_dir)?;
        // Normalize to forward slashes for cross-platform compatibility
        let rel_str = relative.to_string_lossy().replace('\\', "/");

        if path.is_dir() {
            add_dir_to_zip(zip, base_dir, &path, skip_dir, options)?;
        } else {
            zip.start_file(&rel_str, options)?;
            let data = std::fs::read(&path)?;
            zip.write_all(&data)?;
        }
    }
    Ok(())
}

/// Remove everything inside `data_dir` except the `archives_dir` subdirectory.
async fn clear_data_except_archives(
    data_dir: &std::path::Path,
    archives_dir: &std::path::Path,
) -> anyhow::Result<()> {
    let mut rd = fs::read_dir(data_dir).await?;
    while let Some(entry) = rd.next_entry().await? {
        let path = entry.path();
        if path == *archives_dir {
            continue;
        }
        let meta = fs::metadata(&path).await?;
        if meta.is_dir() {
            fs::remove_dir_all(&path).await?;
        } else {
            fs::remove_file(&path).await?;
        }
    }
    Ok(())
}

/// Extract a zip archive (as raw bytes) into `target_dir`, preserving relative
/// paths. Entries with `..` in their names are skipped for safety.
fn extract_zip(bytes: &[u8], target_dir: &std::path::Path) -> anyhow::Result<()> {
    let cursor = Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor)?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let name = file.name().replace('\\', "/");

        // Security: reject path traversal attempts
        if name.split('/').any(|p| p == "..") {
            tracing::warn!("Skipping suspicious zip entry: {name}");
            continue;
        }

        let target_path = target_dir.join(&name);

        if name.ends_with('/') {
            std::fs::create_dir_all(&target_path)?;
        } else {
            if let Some(parent) = target_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut output = std::fs::File::create(&target_path)?;
            std::io::copy(&mut file, &mut output)?;
        }
    }
    Ok(())
}
