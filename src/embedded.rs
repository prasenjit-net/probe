use axum::{
    body::Body,
    http::{Response, StatusCode, Uri, header},
    response::IntoResponse,
};
use rust_embed::RustEmbed;

/// Embed the compiled React app from `ui/dist/` into the binary.
#[derive(RustEmbed)]
#[folder = "ui/dist/"]
struct Assets;

/// SPA fallback handler.
/// - Serves the exact file when the path matches an asset in ui/dist/.
/// - Serves index.html for everything else so React Router handles client-side routing.
///
/// Called directly via `Router::fallback(serve_static)` – NOT wrapped in `get()`.
/// A plain handler function is required for Router::fallback in axum 0.7.
pub async fn serve_static(uri: Uri) -> impl IntoResponse {
    let raw = uri.path().trim_start_matches('/');
    let path = if raw.is_empty() { "index.html" } else { raw };

    match Assets::get(path) {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime.as_ref())
                .body(Body::from(content.data.to_vec()))
                .unwrap()
                .into_response()
        }
        None => {
            // SPA fallback: any unknown path → index.html so React Router takes over.
            match Assets::get("index.html") {
                Some(index) => Response::builder()
                    .status(StatusCode::OK)
                    .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
                    .body(Body::from(index.data.to_vec()))
                    .unwrap()
                    .into_response(),
                None => StatusCode::NOT_FOUND.into_response(),
            }
        }
    }
}