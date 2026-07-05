.PHONY: help install dev dev-web dev-api build-mobile android-setup adb-reverse cap-dev cap-run cap-apk cap-install cap-logs cap-crash pwa migrate seed studio generate up down clean reset-db test-up test-down test-exec test-run test-status test-setup test-clean test-static-smoke

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

build-mobile: ## Build web app for Capacitor static export
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
	@# Source ANDROID_HOME from env or local.properties
	@if [ -z "$$ANDROID_HOME" ]; then \
		if [ -f "apps/web/android/local.properties" ]; then \
			ANDROID_HOME=$$(grep '^sdk.dir=' apps/web/android/local.properties | sed 's/^sdk.dir=//'); \
			export ANDROID_HOME; \
		fi; \
	fi
	@if [ -z "$$ANDROID_HOME" ]; then \
		echo "❌ ANDROID_HOME not set. Check local.properties or export ANDROID_HOME."; \
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

cap-dev: adb-reverse ## Sync + open Capacitor project (open Android Studio from Windows)
	@ENV_JAVA_HOME=$$(grep '^JAVA_HOME=' apps/api/.env 2>/dev/null | sed 's/^JAVA_HOME=//'); \
	if [ -n "$$ENV_JAVA_HOME" ] && [ "$$JAVA_HOME" != "$$ENV_JAVA_HOME" ]; then \
		echo "  ⚠ JAVA_HOME mismatch: env=$$JAVA_HOME, .env=$$ENV_JAVA_HOME — using .env" && export JAVA_HOME="$$ENV_JAVA_HOME"; \
	elif [ -z "$$JAVA_HOME" ] && [ -n "$$ENV_JAVA_HOME" ]; then \
		export JAVA_HOME="$$ENV_JAVA_HOME"; \
	fi; \
	if [ -z "$$JAVA_HOME" ]; then \
		echo "ERROR: JAVA_HOME is not set. Set it in apps/api/.env or export it in your environment."; exit 1; \
	fi; \
	cd apps/web && CAPACITOR_LIVE_RELOAD=true npx cap sync
	@echo "📱 Synced. Now open Android Studio on Windows, open the project at:"
	@echo "   apps/web/android/"
	@echo "   Then press ▶ Run to launch on emulator."

cap-run: adb-reverse ## Install and launch APK directly on connected emulator (bypasses native-run)
	@ENV_JAVA_HOME=$$(grep '^JAVA_HOME=' apps/api/.env 2>/dev/null | sed 's/^JAVA_HOME=//'); \
	if [ -n "$$ENV_JAVA_HOME" ] && [ "$$JAVA_HOME" != "$$ENV_JAVA_HOME" ]; then \
		echo "  ⚠ JAVA_HOME mismatch: env=$$JAVA_HOME, .env=$$ENV_JAVA_HOME — using .env" && export JAVA_HOME="$$ENV_JAVA_HOME"; \
	elif [ -z "$$JAVA_HOME" ] && [ -n "$$ENV_JAVA_HOME" ]; then \
		export JAVA_HOME="$$ENV_JAVA_HOME"; \
	fi; \
	if [ -z "$$JAVA_HOME" ]; then \
		echo "ERROR: JAVA_HOME is not set. Set it in apps/api/.env or export it in your environment."; exit 1; \
	fi; \
	cd apps/web && CAPACITOR_LIVE_RELOAD=true npx cap sync && \
	cd android && ./gradlew assembleDebug && \
	ADB=$$(command -v adb 2>/dev/null || command -v adb.exe 2>/dev/null); \
	$$ADB -s emulator-5554 install -r app/build/outputs/apk/debug/app-debug.apk && \
	$$ADB -s emulator-5554 shell am start -n com.journiful.app/.MainActivity

cap-apk: build-mobile ## Build the APK (static export + cap sync + gradle)
	cd apps/web && npx cap sync && \
	cd android && JAVA_HOME=$${JAVA_HOME:-/home/chend/tools/jdk21} ./gradlew assembleDebug

cap-install: ## Install latest APK on emulator and launch
	ADB=$$(command -v adb 2>/dev/null || command -v adb.exe 2>/dev/null); \
	$$ADB -s emulator-5554 install -r apps/web/android/app/build/outputs/apk/debug/app-debug.apk && \
	$$ADB -s emulator-5554 shell am start -n com.journiful.app/.MainActivity

cap-logs: ## Tail Capacitor WebView JS console logs
	ADB=$$(command -v adb 2>/dev/null || command -v adb.exe 2>/dev/null); \
	$$ADB -s emulator-5554 logcat chromium:V *:S

cap-crash: ## Show Android crash logs
	ADB=$$(command -v adb 2>/dev/null || command -v adb.exe 2>/dev/null); \
	$$ADB -s emulator-5554 logcat -d AndroidRuntime:E *:S

BUILD_NUMBER ?= $(shell git rev-list --count HEAD 2>/dev/null || echo 1)
GIT_BRANCH ?= $(shell git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
GIT_SHA ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
VERSION_NAME ?= $(GIT_BRANCH)-$(GIT_SHA)
FIREBASE_TESTERS := $(shell grep '^FIREBASE_APP_DISTRIBUTION_TESTERS=' apps/api/.env 2>/dev/null | sed 's/^FIREBASE_APP_DISTRIBUTION_TESTERS=//' || echo "")
TESTERS ?= $(FIREBASE_TESTERS)

distribute-android: ## Build and distribute Android APK via Firebase App Distribution
	@echo "Release: $(VERSION_NAME) (build $(BUILD_NUMBER))"
	@echo "Generating release notes..."
	git log --oneline -5 > /tmp/release-notes.txt
	@echo "Extracting service account credentials..."
	@if [ -z "$$FIREBASE_SERVICE_ACCOUNT" ]; then \
		if [ -f "apps/api/.env" ]; then \
			grep '^FIREBASE_SERVICE_ACCOUNT=' apps/api/.env | sed 's/^FIREBASE_SERVICE_ACCOUNT=//' > /tmp/firebase-sa.json; \
		else \
			echo "ERROR: FIREBASE_SERVICE_ACCOUNT not set and apps/api/.env not found"; exit 1; \
		fi; \
	else \
		echo "$$FIREBASE_SERVICE_ACCOUNT" > /tmp/firebase-sa.json; \
	fi
	@echo "Building web app for mobile..."
	NEXT_PUBLIC_API_URL=https://api.journiful.app/api $(MAKE) build-mobile
	@echo "Syncing Capacitor assets..."
	cd apps/web && npx cap sync
	@echo "Building and distributing APK to Firebase..."
	@GRADLE_ARGS="-PbuildNumber=$(BUILD_NUMBER) -PversionNameOverride=$(VERSION_NAME) -PreleaseNotesFile=/tmp/release-notes.txt"; \
	if [ -n "$(TESTERS)" ]; then \
		GRADLE_ARGS="$$GRADLE_ARGS -Ptesters=$(TESTERS)"; \
	fi; \
	ENV_JAVA_HOME=$$(grep '^JAVA_HOME=' apps/api/.env 2>/dev/null | sed 's/^JAVA_HOME=//'); \
	if [ -n "$$ENV_JAVA_HOME" ] && [ "$$JAVA_HOME" != "$$ENV_JAVA_HOME" ]; then \
		echo "  ⚠ JAVA_HOME mismatch: env=$$JAVA_HOME, .env=$$ENV_JAVA_HOME — using .env" && export JAVA_HOME="$$ENV_JAVA_HOME"; \
	elif [ -z "$$JAVA_HOME" ] && [ -n "$$ENV_JAVA_HOME" ]; then \
		export JAVA_HOME="$$ENV_JAVA_HOME"; \
	fi; \
	if [ -z "$$JAVA_HOME" ]; then \
		echo "ERROR: JAVA_HOME is not set. Set it in apps/api/.env or export it in your environment."; exit 1; \
	fi; \
	@cd apps/web/android && GOOGLE_APPLICATION_CREDENTIALS=/tmp/firebase-sa.json \
		./gradlew assembleDebug appDistributionUploadDebug $$GRADLE_ARGS; \
	EXIT=$$?; \
	rm -f /tmp/firebase-sa.json /tmp/release-notes.txt; \
	exit $$EXIT
	@echo "Distribution complete. Check Firebase Console."

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
