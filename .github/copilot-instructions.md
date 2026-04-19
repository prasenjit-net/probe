# Copilot instructions for Probe

Probe is a self-hosted API regression testing app with a Rust backend and an embedded React frontend. Keep changes consistent with the current code, not just the README.

## Architecture

- Backend: Rust 2024, Axum, Tokio. Entry point is `src/main.rs`.
- Frontend: React 18 + TypeScript + Vite in `ui/`.
- The frontend build output in `ui/dist/` is embedded into the Rust binary via `src/embedded.rs`.
- App data is file-based, stored as JSON under `data/`. Do not introduce a database-oriented pattern unless explicitly requested.

## Source of truth

- API routing lives in `src/api/mod.rs`.
- Shared backend domain models live in `src/models/mod.rs`.
- Frontend API calls live in `ui/src/api/client.ts`.
- Frontend types live in `ui/src/types/index.ts`.
- The README is useful, but code is the source of truth when they differ.

## Change guidelines

- Keep backend and frontend contracts in sync. If a Rust model or API payload changes, update the matching TypeScript types and API client usage.
- When adding a new backend endpoint, wire it through `src/api/mod.rs` and add the corresponding client helper in `ui/src/api/client.ts` if the UI uses it.
- Preserve the file-backed storage model and existing JSON formats where possible.
- For execution or queue persistence, prefer the existing helpers in `src/storage/mod.rs`, including atomic writes for shared files.
- Keep auth cookie-based and consistent with the current `/api/auth/*` flow and protected frontend routes.
- Reuse existing patterns for collections, environments, archive handling, reports, and spec generation instead of introducing parallel abstractions.

## Development workflow

- Recommended local run: `make run`
- Hot reload: `make dev`
- Rust checks: `cargo fmt --all -- --check`, `cargo clippy --all-targets --all-features -- -D warnings`, `cargo check --all-targets`, `cargo test --all-targets`
- UI checks: `cd ui && npm ci && npm run lint && npm run build`

## Style conventions

- Rust code is organized by feature modules under `src/api/`, `src/models/`, and `src/storage/`.
- TypeScript uses functional React components, hooks, and a centralized Axios client.
- Match the existing formatting and naming in touched files. Do not add comments unless they clarify non-obvious logic.
- Prefer small, surgical changes over broad refactors.

## Project-specific notes

- Authentication uses the `probe_session` cookie.
- Request and test-plan flows support variable extraction and variable mapping; preserve those data shapes when editing related features.
- AI-related features are optional and depend on `openai.api_key` in `config.toml`.
- There are active features beyond the README summary, including archive and environment management; check the router and UI before assuming a feature does not exist.
