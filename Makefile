# ────────────────────────────────────────────────────────────────────────────
#  Probe – top-level Makefile
# ────────────────────────────────────────────────────────────────────────────

# ── Configurable variables ───────────────────────────────────────────────────
UI_DIR      := ui
DIST_DIR    := $(UI_DIR)/dist
BINARY      := target/debug/probe
RELEASE_BIN := target/release/probe

# Detect a package manager (npm is the fallback)
NPM         := $(shell command -v pnpm 2>/dev/null || command -v npm)

.DEFAULT_GOAL := help

# ── Phony targets ────────────────────────────────────────────────────────────
.PHONY: help \
        ui-install ui-build ui-build-watch \
        build build-release \
        run run-release \
        dev \
        check lint fmt \
        test \
        clean clean-ui clean-all

# ────────────────────────────────────────────────────────────────────────────
#  Help
# ────────────────────────────────────────────────────────────────────────────
help: ## Show this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} \
	     /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# ────────────────────────────────────────────────────────────────────────────
#  UI (React / Vite)
# ────────────────────────────────────────────────────────────────────────────
ui-install: ## Install UI dependencies  (npm / pnpm install)
	cd $(UI_DIR) && $(NPM) install

ui-build: ui-install ## Build the React UI into ui/dist/
	cd $(UI_DIR) && $(NPM) run build

ui-build-watch: ui-install ## Watch UI source and rebuild on changes (no Rust involvement)
	cd $(UI_DIR) && $(NPM) run dev

# ────────────────────────────────────────────────────────────────────────────
#  Rust build
# ────────────────────────────────────────────────────────────────────────────
build: ui-build ## Build debug binary  (UI is embedded automatically)
	cargo build

build-release: ui-build ## Build optimised release binary
	cargo build --release

# ────────────────────────────────────────────────────────────────────────────
#  Run
# ────────────────────────────────────────────────────────────────────────────
run: build ## Build (debug) then start the server
	cargo run

run-release: build-release ## Build (release) then start the server
	$(RELEASE_BIN)

# ────────────────────────────────────────────────────────────────────────────
#  Development mode
#
#  Starts the Rust backend (cargo watch) and the Vite dev-server in parallel.
#  The Vite dev-server proxies /api → http://localhost:7654.
#  Requires:  cargo-watch  (cargo install cargo-watch)
# ────────────────────────────────────────────────────────────────────────────
dev: ## Run backend + UI dev-server concurrently (requires cargo-watch)
	@echo "─── Starting Vite dev server on :5173 and Rust backend on :7654 ───"
	@trap 'kill 0' SIGINT; \
	  (cd $(UI_DIR) && $(NPM) run dev) & \
	  cargo watch -x run & \
	  wait

# ────────────────────────────────────────────────────────────────────────────
#  Code quality
# ────────────────────────────────────────────────────────────────────────────
check: ## cargo check (fast type-check, no binary produced)
	cargo check

lint: ## Run clippy on all targets
	cargo clippy --all-targets --all-features -- -D warnings

fmt: ## Format Rust code with rustfmt
	cargo fmt --all

fmt-check: ## Check formatting without modifying files
	cargo fmt --all -- --check

# ────────────────────────────────────────────────────────────────────────────
#  Tests
# ────────────────────────────────────────────────────────────────────────────
test: ## Run Rust tests
	cargo test

# ────────────────────────────────────────────────────────────────────────────
#  Clean
# ────────────────────────────────────────────────────────────────────────────
clean: ## Remove Rust build artefacts  (keeps ui/dist)
	cargo clean

clean-ui: ## Remove ui/node_modules and ui/dist
	rm -rf $(UI_DIR)/node_modules $(DIST_DIR)

clean-all: clean clean-ui ## Remove all generated artefacts
