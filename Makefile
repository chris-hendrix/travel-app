.PHONY: help install dev dev-web dev-api mockup mobile-web-export mobile-web-serve build-mobile android-setup adb-reverse android-dev android-apk android-install android-logs pwa migrate seed studio generate up down clean reset-db test-up test-down test-exec test-run test-status test-setup test-clean test-static-smoke

.DEFAULT_GOAL := help

help: ## Show available commands
	@echo "Usage: make <target>"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

# --- Dev shortcuts ---

install: ## Install all dependencies
	pnpm install

dev: ## Start dev servers (web:3000, api:8000)
	pnpm dev

dev-web: ## Start web dev server only
	pnpm dev:web

dev-api: ## Start API dev server only (with Docker)
	pnpm dev:api

# Like `make dev`, but for the Expo app instead of the web app: API + Expo
# side by side (api:8000, expo:8081). Same host-only rule as `make mockup` —
# the devcontainer publishes only 3000 and 8000, so both servers must run on
# the host. Ctrl-C stops both (the trap kills the backgrounded API).
dev-mobile: ## Start API + Expo for mobile wiring (api:8000, expo:8081)
	pnpm docker:up
	@cd apps/mobile && \
		echo "" && \
		echo "  api               http://localhost:8000" && \
		echo "  expo (mobile)     http://localhost:8081" && \
		echo "  design system     http://localhost:8081/design" && \
		echo ""
	@trap 'kill 0' INT TERM; \
		pnpm --filter @journiful/api dev & \
		cd apps/mobile && npx expo start --web --port 8081

# The design mockup is apps/mobile — not the Capacitor shell that build-mobile
# produces. Two things about it are easy to get wrong, and both have cost real
# time: it must run on the host (the devcontainer publishes only 3000 and 8000,
# so a server started inside it is invisible to the browser), and it must be the
# dev server (a static export compiles __DEV__ to false, and the lab's first
# line redirects /design away in that build).
mockup: ## Serve the design mockup on the host (design system at /design)
	@cd apps/mobile && \
		echo "" && \
		echo "  mockup          http://localhost:8081" && \
		echo "  design system   http://localhost:8081/design" && \
		WSL_IP=$$(hostname -I 2>/dev/null | awk '{print $$1}'); \
		if [ -n "$$WSL_IP" ]; then echo "  from Windows    http://$$WSL_IP:8081"; fi; \
		echo ""
	@cd apps/mobile && npx expo start --web --port 8081

migrate: ## Run database migrations
	cd apps/api && pnpm db:migrate

seed: ## Seed the database with sample data
	cd apps/api && pnpm db:seed

studio: ## Open Drizzle Studio
	cd apps/api && pnpm db:studio

generate: ## Generate migration from schema changes
	cd apps/api && pnpm db:generate

pwa: ## Build + serve web in production mode for PWA testing (api:8000, web:3000)
	pnpm docker:up && cd apps/web && pnpm build && cd ../.. && pnpm dev:api & cd apps/web && pnpm start

# The product surface is the Expo web export served by the static service.
# Like `make mockup`, both targets run on the host: the devcontainer
# publishes only 3000 and 8000, so :8081 is invisible from inside it.
# The export bakes EXPO_PUBLIC_API_URL in at build time (override it to
# point the artifact at production); --clear lives in the export:web script
# because the URL is inlined by Babel outside Metro's cache key.
mobile-web-export: ## Build the Expo web export (apps/mobile dist/)
	cd apps/mobile && EXPO_PUBLIC_API_URL=$${EXPO_PUBLIC_API_URL:-http://localhost:8000/api} pnpm export:web

mobile-web-serve: ## Serve the built Expo web export on the host (expo:8081)
	cd apps/mobile && pnpm serve:web

# The frozen web app's static export. Capacitor is gone, so nothing ships
# this to a device: it stays because `test-static-smoke` builds it, and
# that smoke test is the only check on the rollback target's artifact.
build-mobile: ## Build the frozen web app's static export (rollback target)
	cd apps/web && pnpm build:mobile

adb-reverse: ## Forward emulator ports to host (for Android emulator dev)
	@ADB=$$(command -v adb 2>/dev/null || command -v adb.exe 2>/dev/null); \
	if [ -z "$$ADB" ]; then \
		echo "❌ adb not found. Install Android SDK tools and ensure platform-tools is in PATH."; \
		exit 1; \
	fi; \
	$$ADB reverse tcp:8000 tcp:8000 && $$ADB reverse tcp:3000 tcp:3000 && \
	echo "✅ Port forwarding active: emulator:8000 → host:8000, emulator:3000 → host:3000"

android-setup: ## One-time WSL2 Android SDK interop setup (symlinks, sdkmanager)
	@echo "🔧 Setting up WSL2 ↔ Windows Android SDK interop..."
	@if [ -z "$$ANDROID_HOME" ]; then \
		echo "❌ ANDROID_HOME not set. Export the Windows SDK path,"; \
		echo "   e.g. /mnt/c/Users/<you>/AppData/Local/Android/Sdk"; \
		exit 1; \
	fi
	@echo "  SDK: $$ANDROID_HOME"
	@# Symlink platform-tools binaries (idempotent)
	@for tool in adb fastboot sqlite3; do \
		if [ -f "$$ANDROID_HOME/platform-tools/$${tool}.exe" ] && [ ! -L "$$ANDROID_HOME/platform-tools/$$tool" ]; then \
			ln -sf "$$ANDROID_HOME/platform-tools/$${tool}.exe" "$$ANDROID_HOME/platform-tools/$$tool" && \
			echo "  ✓ symlinked $$tool.exe → $$tool"; \
		fi; \
	done
	@# Download Linux cmdline-tools for sdkmanager (if not already present)
	@if [ ! -f "$$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then \
		UNZIP=$$(command -v unzip 2>/dev/null || command -v busybox 2>/dev/null); \
		if [ -z "$$UNZIP" ]; then \
			echo "  ⚠ unzip not found (install with: sudo apt install unzip)"; \
			echo "  ⏭ skipping sdkmanager"; \
		else \
			echo "  ⬇ Downloading Linux cmdline-tools..."; \
			mkdir -p "$$ANDROID_HOME/cmdline-tools/latest"; \
			curl -sL -o /tmp/cmdline-tools.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" && \
			rm -rf /tmp/cmdline-tools && \
			if [ "$$UNZIP" = "$$(command -v busybox 2>/dev/null)" ]; then \
				busybox unzip -qo /tmp/cmdline-tools.zip -d /tmp/cmdline-tools; \
			else \
				unzip -qo /tmp/cmdline-tools.zip -d /tmp/cmdline-tools; \
			fi && \
			cp -r /tmp/cmdline-tools/cmdline-tools/bin/* "$$ANDROID_HOME/cmdline-tools/latest/bin/" && \
			cp -r /tmp/cmdline-tools/cmdline-tools/lib "$$ANDROID_HOME/cmdline-tools/latest/" && \
			rm -rf /tmp/cmdline-tools /tmp/cmdline-tools.zip && \
			echo "  ✓ sdkmanager installed (with lib/ dependencies)"; \
		fi; \
	else \
		echo "  ✓ sdkmanager already present"; \
	fi
	@# Report build-tools status
	@echo "  Build-tools available:"
	@ls -d "$$ANDROID_HOME"/build-tools/*/ 2>/dev/null | while read dir; do \
		ver=$$(basename "$$dir"); \
		native=$$(ls "$$dir"/aapt 2>/dev/null && echo "native" || echo "exe-only"); \
		echo "    $$ver ($$native)"; \
	done
	@echo "✅ Android SDK WSL2 interop setup complete"

# The native loop for the Expo app (apps/mobile). JAVA_HOME resolution is
# the same one cap-dev used: the environment wins unless apps/api/.env
# disagrees, in which case .env wins and says so.
android-dev: adb-reverse ## Prebuild (if needed) + run the Expo app on Android
	@ENV_JAVA_HOME=$$(grep '^JAVA_HOME=' apps/api/.env 2>/dev/null | sed 's/^JAVA_HOME=//'); \
	if [ -n "$$ENV_JAVA_HOME" ] && [ "$$JAVA_HOME" != "$$ENV_JAVA_HOME" ]; then \
		echo "  ⚠ JAVA_HOME mismatch: env=$$JAVA_HOME, .env=$$ENV_JAVA_HOME — using .env" && export JAVA_HOME="$$ENV_JAVA_HOME"; \
	elif [ -z "$$JAVA_HOME" ] && [ -n "$$ENV_JAVA_HOME" ]; then \
		export JAVA_HOME="$$ENV_JAVA_HOME"; \
	fi; \
	if [ -z "$$JAVA_HOME" ]; then \
		echo "ERROR: JAVA_HOME is not set. Set it in apps/api/.env or export it in your environment."; exit 1; \
	fi; \
	cd apps/mobile && (test -d android || npx expo prebuild -p android) && npx expo run:android

android-apk: ## Prebuild + assemble the signed release APK (Expo app)
	@ENV_JAVA_HOME=$$(grep '^JAVA_HOME=' apps/api/.env 2>/dev/null | sed 's/^JAVA_HOME=//'); \
	if [ -n "$$ENV_JAVA_HOME" ] && [ "$$JAVA_HOME" != "$$ENV_JAVA_HOME" ]; then \
		echo "  ⚠ JAVA_HOME mismatch: env=$$JAVA_HOME, .env=$$ENV_JAVA_HOME — using .env" && export JAVA_HOME="$$ENV_JAVA_HOME"; \
	elif [ -z "$$JAVA_HOME" ] && [ -n "$$ENV_JAVA_HOME" ]; then \
		export JAVA_HOME="$$ENV_JAVA_HOME"; \
	fi; \
	if [ -z "$$JAVA_HOME" ]; then \
		echo "ERROR: JAVA_HOME is not set. Set it in apps/api/.env or export it in your environment."; exit 1; \
	fi; \
	cd apps/mobile && npx expo prebuild -p android --clean && cd android && ./gradlew assembleRelease

android-install: ## Install the release APK on the emulator and launch
	ADB=$$(command -v adb 2>/dev/null || command -v adb.exe 2>/dev/null); \
	$$ADB -s emulator-5554 install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk && \
	$$ADB -s emulator-5554 shell am start -n com.journiful.app/.MainActivity

android-logs: ## Tail native logs on the emulator
	ADB=$$(command -v adb 2>/dev/null || command -v adb.exe 2>/dev/null); \
	$$ADB -s emulator-5554 logcat

# --- Infrastructure ---

up: ## Start Docker services (postgres, minio)
	docker-compose up -d postgres minio minio-init

down: ## Stop Docker services
	docker-compose down

clean: ## Remove all build artifacts and node_modules
	turbo run clean && rm -rf node_modules .turbo

reset-db: ## Drop and recreate database, migrate, and seed
	docker-compose down -v && docker-compose up -d postgres minio minio-init && until docker exec journiful-postgres pg_isready -U journiful > /dev/null 2>&1; do sleep 1; done && docker exec journiful-postgres psql -U journiful -d journiful -tc "SELECT 1 FROM pg_roles WHERE rolname='tripful'" | grep -q 1 || docker exec journiful-postgres psql -U journiful -d journiful -c "CREATE ROLE tripful WITH LOGIN PASSWORD 'tripful_dev' SUPERUSER;" && docker exec journiful-postgres psql -U journiful -d journiful -tc "SELECT 1 FROM pg_database WHERE datname='tripful'" | grep -q 1 || docker exec journiful-postgres psql -U journiful -d journiful -c "CREATE DATABASE tripful OWNER tripful;" ; cd apps/api && pnpm db:migrate && pnpm db:seed

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

pwa: ## Start production build for PWA testing (api:8000, web:3000)
	pnpm docker:up
	cd apps/web && pnpm build && pnpm start &
	cd apps/api && pnpm dev

test-run: ## Run full test suite (unit + E2E)
	$(MAKE) test-exec CMD="pnpm test"
	$(MAKE) test-exec CMD="pnpm test:e2e"

test-pwa: ## Run PWA e2e tests (offline, manifest, push API, install prompts)
	$(MAKE) test-exec CMD="cd apps/web && pnpm exec playwright test tests/e2e/pwa.spec.ts --reporter=list"

test-static-smoke: build-mobile ## Verify static export integrity (no error pages, pages render)
	$(MAKE) test-exec CMD="cd apps/web && npx playwright test tests/static-export --config tests/static-export/playwright.config.ts --reporter=list"

test-clean: ## Remove build caches in devcontainer
	@docker compose -p $(PROJECT) exec -u node -w /workspace app bash -c '\
		rm -rf shared/dist apps/api/dist apps/web/.next \
		       .turbo apps/api/.turbo apps/web/.turbo shared/.turbo \
		&& find . -name "*.tsbuildinfo" -not -path "*/node_modules/*" -delete \
		&& echo "[clean] Build caches removed"'

test-status: ## Check devcontainer status
	@docker compose -p $(PROJECT) ps 2>/dev/null || echo "No container running for $(SLUG)"
