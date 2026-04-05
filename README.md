# Probe

**Probe** is a self-hosted regression test suite designer, manager, and executor for HTTP APIs. Your team can design test plans, run them immediately or on a schedule, and view rich execution reports — all from the browser. All data is stored as human-readable JSON files; no database required.

---

## Features

| Area | What you can do |
|------|----------------|
| **Request Library** | Create, edit, and organise HTTP requests with headers, query params, body, and per-request variables |
| **Assertions** | Attach assertions to each request (status code, JSON path, header, body text) — pass/fail evaluated at runtime |
| **Variable Extraction** | Extract values from responses (JSON path, header, status code) into named variables for use in later steps |
| **Collections** | Group requests *or* test plans into named collections (separate namespaces); delete a collection to cascade-delete its contents |
| **Test Plan Designer** | Chain multiple requests into a sequential test plan; map output variables from one step as inputs to the next |
| **Execution Queue** | Run a test plan immediately or schedule it for a future time; a background engine processes the queue automatically |
| **Execution History** | View all past and active executions; cancel running jobs; clear history; configurable auto-trim keeps the log size bounded |
| **Reports** | Detailed per-step reports with request/response snapshots, assertion results, extracted variables, and overall pass/fail status |
| **AI Summary** | After execution, an AI-generated Markdown summary is attached to the report (requires OpenAI key) |
| **PDF Export** | Export any report (including AI summary) as a PDF |
| **API Spec Import** | Upload an OpenAPI (YAML/JSON) spec and let AI generate a full set of requests and a test plan automatically (RFC 9535 JSONPath) |
| **Dark / Light theme** | System-aware theme toggle, persisted in `localStorage` |
| **Single binary deploy** | The React UI is embedded in the Rust binary — one file to copy |

---

## Prerequisites

| Tool | Minimum version | Notes |
|------|----------------|-------|
| Rust | 1.80 | Install via [rustup](https://rustup.rs) |
| Node.js | 18 | For building the UI |
| npm / pnpm | any recent | `pnpm` is preferred if present |
| `cargo-watch` | any | Optional — only needed for `make dev` hot-reload |

---

## Quick start

### Option A — `make` (recommended)

```bash
# 1. Copy and edit the config
cp config.example.toml config.toml

# 2. Build UI + backend, then start the server
make run
```

Open `http://127.0.0.1:3000` and log in with the credentials from `config.toml` (default `admin` / `admin`).

### Option B — manual steps

```bash
# 1. Build the React UI
cd ui && npm install && npm run build && cd ..

# 2. Start the backend (embeds ui/dist/ automatically)
cargo run
```

### Option C — release build

```bash
make run-release          # optimised binary at target/release/probe
# or manually:
cd ui && npm run build && cd .. && cargo build --release
./target/release/probe
```

---

## Development mode (hot-reload)

```bash
make dev
```

This starts both the Vite dev-server (port 5173, proxies `/api` → `:3000`) and the Rust backend via `cargo-watch` in parallel. Edit UI source files and see changes instantly without rebuilding the binary.

```bash
# Alternatively, run each in its own terminal:
cargo watch -x run          # terminal 1 — Rust hot-reload
cd ui && npm run dev        # terminal 2 — Vite dev-server
```

---

## Makefile targets

```
make help            Show all targets
make run             Build (debug) then start the server        ← most common
make run-release     Build (release) then start the server
make dev             Backend + Vite dev-server concurrently
make build           Build debug binary only
make build-release   Build release binary only
make ui-build        Build the React UI only  (ui/dist/)
make check           Fast Rust type-check (no binary)
make lint            Run clippy
make fmt             Auto-format Rust code
make test            Run Rust unit tests
make clean           Remove Rust build artefacts
make clean-ui        Remove ui/node_modules and ui/dist
make clean-all       Remove everything generated
```

---

## Configuration (`config.toml`)

Copy `config.example.toml` to `config.toml` and adjust as needed. The file is reloaded at startup.

```toml
[server]
host = "127.0.0.1"   # bind address
port = 3000          # bind port

[auth]
username = "admin"
password = "admin"   # plain-text; bcrypt-hashed at startup

[session]
ttl_seconds = 3600   # session lifetime (seconds)

[logging]
level = "info"       # trace | debug | info | warn | error

[app]
name = "Probe"
max_executions = 20  # max history entries; oldest finished ones are trimmed

[openai]
api_key = ""         # leave empty to disable AI features
model = "gpt-4o-mini"
temperature = 0.1
max_tokens = 2000
```

| Key | Default | Description |
|-----|---------|-------------|
| `server.host` | `127.0.0.1` | Bind address |
| `server.port` | `3000` | Bind port |
| `auth.username` | `admin` | Login username |
| `auth.password` | `admin` | Plain-text password; bcrypt-hashed at startup |
| `session.ttl_seconds` | `3600` | Session lifetime in seconds |
| `logging.level` | `info` | Log verbosity |
| `app.name` | `Probe` | Display name shown in the UI |
| `app.max_executions` | `20` | Max execution history entries; oldest completed/failed/cancelled entries are auto-removed when exceeded |
| `openai.api_key` | _(empty)_ | OpenAI API key — enables AI test generation and post-execution summaries |
| `openai.model` | `gpt-4o-mini` | OpenAI model to use |

---

## Data storage

All data is stored as JSON files under the `data/` directory (created automatically):

```
data/
├── collections/        # Collection metadata  ({id}.json)
├── requests/           # HTTP request definitions  ({id}.json)
├── test_plans/         # Test plan definitions  ({id}.json)
├── executions.json     # Execution queue & history (single file, auto-trimmed)
├── reports/            # Execution reports  ({id}.json)
└── specs/              # Uploaded OpenAPI specs  ({id}.yaml / {id}.json)
```

- No database is required — all files are human-readable JSON.
- `executions.json` is written atomically (via temp-file rename) to prevent corruption.
- Deleting a collection cascade-deletes all requests or test plans it contains.

---

## API reference

All endpoints under `/api/*` require a valid session cookie (`probe_session`) except login and health.

### Auth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Log in `{ username, password }` → sets `probe_session` cookie |
| `POST` | `/api/auth/logout` | Log out, clears cookie |
| `GET`  | `/api/auth/me` | Returns `{ authenticated, username }` |

### Collections

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/collections?kind=request\|plan` | List collections (filter by kind) |
| `POST` | `/api/collections` | Create collection `{ name, kind }` |
| `GET`  | `/api/collections/:id` | Get collection |
| `PUT`  | `/api/collections/:id` | Rename collection |
| `DELETE` | `/api/collections/:id` | Delete collection and all its contents |

### Requests

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/requests` | List all requests |
| `POST` | `/api/requests` | Create request |
| `GET`  | `/api/requests/:id` | Get request |
| `PUT`  | `/api/requests/:id` | Update request |
| `DELETE` | `/api/requests/:id` | Delete request |

### Test Plans

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/test-plans` | List all test plans |
| `POST` | `/api/test-plans` | Create test plan |
| `GET`  | `/api/test-plans/:id` | Get test plan (enriched with request details) |
| `PUT`  | `/api/test-plans/:id` | Update test plan |
| `DELETE` | `/api/test-plans/:id` | Delete test plan |

### Executions

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/executions` | List all executions |
| `POST` | `/api/executions` | Enqueue `{ test_plan_id, scheduled_at? }` |
| `GET`  | `/api/executions/:id` | Get execution status |
| `DELETE` | `/api/executions/:id` | Cancel a queued/running execution |
| `DELETE` | `/api/executions` | Clear all completed/failed/cancelled history |

### Reports

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/reports` | List all reports |
| `GET`  | `/api/reports/:id` | Get full report |
| `DELETE` | `/api/reports/:id` | Delete report |
| `GET`  | `/api/reports/:id/pdf` | Export report as PDF |

### API Specs (OpenAI-powered)

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/specs` | List uploaded specs |
| `POST` | `/api/specs` | Upload spec file (multipart) |
| `POST` | `/api/specs/import` | Generate requests + test plan from spec via AI |
| `GET`  | `/api/specs/:id/preview` | Preview generated requests before importing |
| `DELETE` | `/api/specs/:id` | Delete spec |

### Other

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET`  | `/api/health` | ✓ | Health + uptime JSON |
| `GET`  | `/api/metrics/summary` | ✓ | JSON metrics for the dashboard |
| `GET`  | `/metrics` | ✗ | Prometheus text-format scrape endpoint |

---

## Project layout

```
probe/
├── config.toml              # Runtime config (gitignored — copy from config.example.toml)
├── config.example.toml      # Config template
├── Makefile                 # Build & run targets
├── Cargo.toml               # Rust dependencies
├── data/                    # Runtime data (JSON files, gitignored in production)
├── src/
│   ├── main.rs              # Entry point: config load, dir init, server start
│   ├── config.rs            # AppConfig structs + TOML loader
│   ├── state.rs             # AppState (sessions, execution lock)
│   ├── auth.rs              # Cookie-based auth middleware
│   ├── embedded.rs          # Embeds ui/dist/ into the binary (rust-embed)
│   ├── executor.rs          # Background execution engine
│   ├── ai_generator.rs      # OpenAI integration (request + plan generation, summaries)
│   ├── pdf_generator.rs     # PDF export (printpdf)
│   ├── models/              # Shared data models (serde structs)
│   ├── storage/             # File I/O helpers (atomic write, vec read/write, migration)
│   └── api/
│       ├── mod.rs           # Axum router wiring
│       ├── auth_routes.rs   # Login / logout / me
│       ├── collections.rs   # Collections CRUD
│       ├── requests.rs      # Request CRUD
│       ├── test_plans.rs    # Test plan CRUD
│       ├── executions.rs    # Execution queue + clear
│       ├── reports.rs       # Reports + PDF export
│       ├── specs.rs         # OpenAPI spec upload + AI generation
│       ├── health.rs        # Health endpoint
│       └── metrics_handler.rs # Prometheus + summary
└── ui/                      # React + Vite + Tailwind frontend
    ├── src/
    │   ├── App.tsx           # Routes + lazy page loading
    │   ├── pages/            # One file per page
    │   ├── components/       # Shared UI components
    │   ├── context/          # Auth + Theme React contexts
    │   ├── api/client.ts     # Axios API client (all endpoints)
    │   └── types/index.ts    # TypeScript types (mirrors Rust models)
    └── dist/                 # Build output — embedded into the binary
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Backend language | Rust (edition 2024) |
| HTTP framework | Axum 0.8 |
| Async runtime | Tokio |
| HTTP client | reqwest |
| JSON | serde / serde_json |
| JSONPath (assertions) | serde_json_path (RFC 9535) |
| PDF generation | printpdf |
| UI embedding | rust-embed |
| Frontend framework | React 18 + TypeScript |
| Build tool | Vite 5 |
| Styling | Tailwind CSS v3 |
| Icons | Lucide React |
| Markdown rendering | react-markdown |
