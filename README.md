# Probe

A Rust web application with an embedded React UI.

## Project layout

```
probe/
├── config.toml          # Runtime configuration (server, auth, session, logging)
├── Cargo.toml           # Rust dependencies
├── src/
│   ├── main.rs          # Entry point – loads config, starts Axum server
│   ├── config.rs        # Config structs & TOML loader
│   ├── state.rs         # Shared AppState (sessions, counters)
│   ├── auth.rs          # Cookie-based auth middleware
│   ├── embedded.rs      # Embeds ui/dist/ into the binary via rust-embed
│   └── api/
│       ├── mod.rs           # Router wiring
│       ├── auth_routes.rs   # POST /api/auth/login|logout  GET /api/auth/me
│       ├── health.rs        # GET  /api/health
│       └── metrics_handler.rs # GET /api/metrics/summary  GET /metrics (Prometheus)
└── ui/                  # React + Vite + Tailwind UI
    ├── src/
    │   ├── App.tsx
    │   ├── pages/
    │   │   ├── Login.tsx
    │   │   └── Dashboard.tsx
    │   ├── components/
    │   │   ├── Layout.tsx
    │   │   ├── ProtectedRoute.tsx
    │   │   └── ThemeToggle.tsx
    │   ├── context/
    │   │   ├── AuthContext.tsx
    │   │   └── ThemeContext.tsx
    │   ├── api/client.ts
    │   └── types/index.ts
    └── dist/            # Build output – embedded into the Rust binary
```

## Quick start

### 1 — Build the React UI

```bash
cd ui
npm install
npm run build   # writes to ui/dist/
cd ..
```

### 2 — Run the Rust server

```bash
cargo run
```

The server starts on `http://127.0.0.1:3000` (configurable in `config.toml`).

### 3 — During UI development (hot-reload)

Run the Rust backend and the Vite dev server simultaneously:

```bash
# terminal 1
cargo run

# terminal 2
cd ui && npm run dev     # proxies /api → http://localhost:3000
```

Open `http://localhost:5173`.

---

## Configuration (`config.toml`)

| Key | Default | Description |
|-----|---------|-------------|
| `server.host` | `127.0.0.1` | Bind address |
| `server.port` | `3000` | Bind port |
| `auth.username` | `admin` | Login username |
| `auth.password` | `admin` | Login password (plain-text; bcrypt-hashed at startup) |
| `session.ttl_seconds` | `3600` | Session lifetime |
| `logging.level` | `info` | Log level (`trace` / `debug` / `info` / `warn` / `error`) |
| `app.name` | `Probe` | Application name shown in the UI |

---

## API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | ✗ | Log in, sets `probe_session` cookie |
| `POST` | `/api/auth/logout` | ✓ | Log out, clears cookie |
| `GET`  | `/api/auth/me` | ✓ | Returns `{ authenticated, username }` |
| `GET`  | `/api/health` | ✓ | Health + uptime JSON |
| `GET`  | `/api/metrics/summary` | ✓ | JSON metrics for the dashboard |
| `GET`  | `/metrics` | ✗ | Prometheus text-format scrape endpoint |

---

## Features

- **Auth** – username/password stored in `config.toml`; password is bcrypt-hashed at startup; cookie-based session with configurable TTL
- **Logging** – structured logs via `tracing` / `tracing-subscriber`
- **Metrics** – atomic in-process counters; Prometheus text format at `/metrics`
- **Dashboard** – health status, uptime, active sessions, request & login counters; auto-refreshes every 30 s
- **Dark/light theme** – Tailwind class-based, persisted to `localStorage`
- **Embedded UI** – `ui/dist/` is baked into the binary via `rust-embed`; single deployable artifact
