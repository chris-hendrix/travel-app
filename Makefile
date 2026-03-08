.PHONY: help install dev dev-web dev-api migrate seed studio generate up down clean reset-db test-up test-down test-exec test-run test-status test-setup test-clean

.DEFAULT_GOAL := help

help: ## Show available commands
	@echo "Usage: make <target>"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

# --- Dev shortcuts ---

install: ## Install all dependencies
	pnpm install

dev: ## Start Docker + dev servers (web:3000, api:8000)
	pnpm dev

dev-web: ## Start web dev server only
	pnpm dev:web

dev-api: ## Start API dev server only (with Docker)
	pnpm dev:api

migrate: ## Run database migrations
	cd apps/api && pnpm db:migrate

seed: ## Seed the database with sample data
	cd apps/api && pnpm db:seed

studio: ## Open Drizzle Studio
	cd apps/api && pnpm db:studio

generate: ## Generate migration from schema changes
	cd apps/api && pnpm db:generate

# --- Infrastructure ---

up: ## Start Docker services (postgres, minio)
	docker-compose up -d postgres minio minio-init

down: ## Stop Docker services
	docker-compose down

clean: ## Remove all build artifacts and node_modules
	turbo run clean && rm -rf node_modules .turbo

reset-db: ## Drop and recreate database, migrate, and seed
	docker-compose down -v && docker-compose up -d postgres minio minio-init && sleep 2 && cd apps/api && pnpm db:migrate && pnpm db:seed

# --- Devcontainer testing ---

SLUG := $(shell basename $(CURDIR) | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g')
PROJECT := $(SLUG)_devcontainer
DC := devcontainer

check-deps:
	@command -v $(DC) >/dev/null 2>&1 || { echo "Error: devcontainer CLI required (npm i -g @devcontainers/cli)"; exit 1; }
	@command -v docker >/dev/null 2>&1 || { echo "Error: docker required"; exit 1; }

test-up: check-deps ## Start devcontainer + run setup
	$(DC) up --workspace-folder . || true
	$(MAKE) test-setup

test-setup: ## Re-run devcontainer setup (idempotent)
	@docker compose -p $(PROJECT) exec -u node -w /workspace app bash .devcontainer/setup.sh

test-down: ## Tear down devcontainer
	docker compose -p $(PROJECT) down -v

test-exec: ## Run command in devcontainer (CMD="...")
	@docker compose -p $(PROJECT) exec -u node -w /workspace app bash -c "$(CMD)"

test-run: ## Run full test suite (unit + E2E)
	$(MAKE) test-exec CMD="pnpm test"
	$(MAKE) test-exec CMD="pnpm test:e2e"

test-clean: ## Remove build caches in devcontainer
	@docker compose -p $(PROJECT) exec -u node -w /workspace app bash -c '\
		rm -rf shared/dist apps/api/dist apps/web/.next \
		       .turbo apps/api/.turbo apps/web/.turbo shared/.turbo \
		&& find . -name "*.tsbuildinfo" -not -path "*/node_modules/*" -delete \
		&& echo "[clean] Build caches removed"'

test-status: ## Check devcontainer status
	@docker compose -p $(PROJECT) ps 2>/dev/null || echo "No container running for $(SLUG)"
