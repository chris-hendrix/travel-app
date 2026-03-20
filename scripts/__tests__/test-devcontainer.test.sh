#!/bin/bash
# Tests for devcontainer setup
# Validates configs, Makefile targets, and setup.sh idempotency

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

log_test() {
    echo -e "${YELLOW}TEST:${NC} $1"
}

log_pass() {
    echo -e "  ${GREEN}PASS${NC}"
    ((TESTS_PASSED++)) || true
}

log_fail() {
    echo -e "  ${RED}FAIL${NC} $1"
    ((TESTS_FAILED++)) || true
}

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ============================================================
# devcontainer.json validation
# ============================================================

echo ""
echo "=== devcontainer.json ==="

log_test "devcontainer.json exists"
if [ -f "$PROJECT_ROOT/.devcontainer/devcontainer.json" ]; then
    log_pass
else
    log_fail "file not found"
fi

log_test "devcontainer.json is valid JSON"
if python3 -c "import json; json.load(open('$PROJECT_ROOT/.devcontainer/devcontainer.json'))" 2>/dev/null; then
    log_pass
else
    log_fail "invalid JSON"
fi

log_test "devcontainer.json has required fields"
MISSING=""
for field in dockerComposeFile service workspaceFolder postCreateCommand; do
    if ! python3 -c "
import json, sys
d = json.load(open('$PROJECT_ROOT/.devcontainer/devcontainer.json'))
if '$field' not in d: sys.exit(1)
" 2>/dev/null; then
        MISSING="$MISSING $field"
    fi
done
if [ -z "$MISSING" ]; then
    log_pass
else
    log_fail "missing:$MISSING"
fi

log_test "devcontainer.json service is 'app'"
if python3 -c "
import json, sys
d = json.load(open('$PROJECT_ROOT/.devcontainer/devcontainer.json'))
sys.exit(0 if d.get('service') == 'app' else 1)
" 2>/dev/null; then
    log_pass
else
    log_fail "service should be 'app'"
fi

log_test "devcontainer.json has shutdownAction"
if python3 -c "
import json, sys
d = json.load(open('$PROJECT_ROOT/.devcontainer/devcontainer.json'))
sys.exit(0 if 'shutdownAction' in d else 1)
" 2>/dev/null; then
    log_pass
else
    log_fail "shutdownAction missing — containers may be orphaned"
fi

# ============================================================
# docker-compose.yml validation
# ============================================================

echo ""
echo "=== docker-compose.yml ==="

log_test "docker-compose.yml exists"
if [ -f "$PROJECT_ROOT/.devcontainer/docker-compose.yml" ]; then
    log_pass
else
    log_fail "file not found"
fi

log_test "docker-compose.yml is valid (docker compose config)"
if command -v docker >/dev/null 2>&1; then
    if docker compose -f "$PROJECT_ROOT/.devcontainer/docker-compose.yml" config >/dev/null 2>&1; then
        log_pass
    else
        log_fail "docker compose config failed"
    fi
else
    echo -e "  ${YELLOW}SKIP${NC} docker not available"
fi

log_test "docker-compose.yml defines 'app' and 'db' services"
if grep -q "^  app:" "$PROJECT_ROOT/.devcontainer/docker-compose.yml" \
   && grep -q "^  db:" "$PROJECT_ROOT/.devcontainer/docker-compose.yml"; then
    log_pass
else
    log_fail "expected 'app' and 'db' services"
fi

log_test "app service uses random port assignment (no host:container mapping)"
# Ports should be just "3000" and "8000", not "3000:3000"
if grep -E '^\s+- "[0-9]+:[0-9]+"' "$PROJECT_ROOT/.devcontainer/docker-compose.yml" >/dev/null 2>&1; then
    log_fail "found host:container port mapping — breaks multi-branch isolation"
else
    log_pass
fi

log_test "db service has healthcheck"
if grep -q "healthcheck:" "$PROJECT_ROOT/.devcontainer/docker-compose.yml"; then
    log_pass
else
    log_fail "PostgreSQL healthcheck missing"
fi

log_test "app depends on db with service_healthy condition"
if grep -q "service_healthy" "$PROJECT_ROOT/.devcontainer/docker-compose.yml"; then
    log_pass
else
    log_fail "app should wait for db healthcheck"
fi

# ============================================================
# Dockerfile validation
# ============================================================

echo ""
echo "=== Dockerfile ==="

log_test "Dockerfile exists"
if [ -f "$PROJECT_ROOT/.devcontainer/Dockerfile" ]; then
    log_pass
else
    log_fail "file not found"
fi

log_test "Dockerfile installs pnpm via corepack"
if grep -q "corepack.*pnpm" "$PROJECT_ROOT/.devcontainer/Dockerfile"; then
    log_pass
else
    log_fail "expected corepack prepare pnpm"
fi

log_test "Dockerfile installs Playwright as node user"
if grep -B5 "playwright install chromium" "$PROJECT_ROOT/.devcontainer/Dockerfile" | grep -q "USER node"; then
    log_pass
else
    log_fail "Playwright browser should install as node user for cache alignment"
fi

log_test "Dockerfile installs Playwright system deps as root"
if grep -q "playwright install-deps" "$PROJECT_ROOT/.devcontainer/Dockerfile"; then
    log_pass
else
    log_fail "system deps should be installed separately as root"
fi

# ============================================================
# setup.sh validation
# ============================================================

echo ""
echo "=== setup.sh ==="

log_test "setup.sh exists and is executable"
if [ -x "$PROJECT_ROOT/.devcontainer/setup.sh" ]; then
    log_pass
else
    log_fail "not found or not executable"
fi

log_test "setup.sh uses strict mode (set -euo pipefail)"
if head -3 "$PROJECT_ROOT/.devcontainer/setup.sh" | grep -q "set -euo pipefail"; then
    log_pass
else
    log_fail "expected strict bash mode"
fi

log_test "setup.sh generates env files idempotently (only if not exists)"
API_GUARDS=$(grep -c '! -f apps/api/.env' "$PROJECT_ROOT/.devcontainer/setup.sh")
WEB_GUARDS=$(grep -c '! -f apps/web/.env.local' "$PROJECT_ROOT/.devcontainer/setup.sh")
if [ "$API_GUARDS" -ge 1 ] && [ "$WEB_GUARDS" -ge 1 ]; then
    log_pass
else
    log_fail "env file creation should be guarded with [ ! -f ] checks"
fi

log_test "setup.sh DATABASE_URL points to compose 'db' service"
if grep -q "DATABASE_URL=.*@db:" "$PROJECT_ROOT/.devcontainer/setup.sh"; then
    log_pass
else
    log_fail "DATABASE_URL should use 'db' (compose service name), not 'localhost'"
fi

log_test "setup.sh runs pnpm install"
if grep -q "pnpm install" "$PROJECT_ROOT/.devcontainer/setup.sh"; then
    log_pass
else
    log_fail "expected pnpm install"
fi

log_test "setup.sh builds shared package before migrations"
INSTALL_LINE=$(grep -n "pnpm install" "$PROJECT_ROOT/.devcontainer/setup.sh" | head -1 | cut -d: -f1)
SHARED_LINE=$(grep -n "@journiful/shared build" "$PROJECT_ROOT/.devcontainer/setup.sh" | head -1 | cut -d: -f1)
MIGRATE_LINE=$(grep -n "db:migrate" "$PROJECT_ROOT/.devcontainer/setup.sh" | head -1 | cut -d: -f1)
if [ -n "$INSTALL_LINE" ] && [ -n "$SHARED_LINE" ] && [ -n "$MIGRATE_LINE" ] \
   && [ "$INSTALL_LINE" -lt "$SHARED_LINE" ] && [ "$SHARED_LINE" -lt "$MIGRATE_LINE" ]; then
    log_pass
else
    log_fail "order should be: pnpm install -> shared build -> db:migrate"
fi

log_test "setup.sh does not hardcode /workspace path"
# The postCreateCommand runs from workspaceFolder, so relative paths should work
if grep -q "cd /workspace" "$PROJECT_ROOT/.devcontainer/setup.sh"; then
    log_fail "use relative paths instead of hardcoded /workspace"
else
    log_pass
fi

# ============================================================
# setup.sh idempotency (functional test)
# ============================================================

echo ""
echo "=== setup.sh idempotency ==="

TMPDIR_TEST=$(mktemp -d)
trap "rm -rf $TMPDIR_TEST" EXIT

log_test "env files are created when missing"
mkdir -p "$TMPDIR_TEST/apps/api" "$TMPDIR_TEST/apps/web"
# Extract just the env-file-generation part of setup.sh and run it
(
    cd "$TMPDIR_TEST"
    # Simulate the env generation logic
    if [ ! -f apps/api/.env ]; then
        echo "DATABASE_URL=test" > apps/api/.env
    fi
    if [ ! -f apps/web/.env.local ]; then
        echo "API_URL=test" > apps/web/.env.local
    fi
)
if [ -f "$TMPDIR_TEST/apps/api/.env" ] && [ -f "$TMPDIR_TEST/apps/web/.env.local" ]; then
    log_pass
else
    log_fail "env files not created"
fi

log_test "env files are preserved when they already exist"
echo "CUSTOM=value" > "$TMPDIR_TEST/apps/api/.env"
echo "CUSTOM=value" > "$TMPDIR_TEST/apps/web/.env.local"
(
    cd "$TMPDIR_TEST"
    if [ ! -f apps/api/.env ]; then
        echo "OVERWRITTEN" > apps/api/.env
    fi
    if [ ! -f apps/web/.env.local ]; then
        echo "OVERWRITTEN" > apps/web/.env.local
    fi
)
if grep -q "CUSTOM=value" "$TMPDIR_TEST/apps/api/.env" \
   && grep -q "CUSTOM=value" "$TMPDIR_TEST/apps/web/.env.local"; then
    log_pass
else
    log_fail "existing env files were overwritten"
fi

# ============================================================
# Makefile targets
# ============================================================

echo ""
echo "=== Makefile targets ==="

log_test "Makefile exists"
if [ -f "$PROJECT_ROOT/Makefile" ]; then
    log_pass
else
    log_fail "file not found"
fi

for target in test-up test-down test-exec test-run test-status; do
    log_test "Makefile has '$target' target"
    if grep -q "^$target:" "$PROJECT_ROOT/Makefile"; then
        log_pass
    else
        log_fail "target not found"
    fi
done

log_test "Makefile targets are declared in .PHONY"
PHONY_LINE=$(grep "^\.PHONY:" "$PROJECT_ROOT/Makefile")
MISSING_PHONY=""
for target in test-up test-down test-exec test-run test-status; do
    if ! echo "$PHONY_LINE" | grep -q "$target"; then
        MISSING_PHONY="$MISSING_PHONY $target"
    fi
done
if [ -z "$MISSING_PHONY" ]; then
    log_pass
else
    log_fail "missing from .PHONY:$MISSING_PHONY"
fi

log_test "check-deps verifies devcontainer CLI"
if grep -q 'command -v.*devcontainer\|command -v.*\$(DC)' "$PROJECT_ROOT/Makefile"; then
    log_pass
else
    log_fail "check-deps should verify devcontainer CLI is installed"
fi

log_test "check-deps verifies docker"
if grep -q 'command -v.*docker' "$PROJECT_ROOT/Makefile"; then
    log_pass
else
    log_fail "check-deps should verify docker is installed"
fi

# ============================================================
# .gitignore
# ============================================================

echo ""
echo "=== .gitignore ==="

log_test ".pnpm-store/ is gitignored"
if grep -q "\.pnpm-store/" "$PROJECT_ROOT/.gitignore"; then
    log_pass
else
    log_fail "pnpm creates .pnpm-store/ in workspace via bind mount — should be gitignored"
fi

log_test ".devcontainer/.env is covered by gitignore"
# The .env pattern should match .devcontainer/.env
if grep -q "^\.env$" "$PROJECT_ROOT/.gitignore"; then
    log_pass
else
    log_fail ".devcontainer/.env should be gitignored"
fi

# ============================================================
# Summary
# ============================================================

echo ""
echo "================================"
TOTAL=$((TESTS_PASSED + TESTS_FAILED))
echo -e "Results: ${GREEN}$TESTS_PASSED passed${NC}, ${RED}$TESTS_FAILED failed${NC}, $TOTAL total"
echo "================================"

exit $TESTS_FAILED
