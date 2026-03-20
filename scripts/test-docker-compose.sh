#!/bin/bash
# Unit tests for Docker Compose configuration

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

# Get script directory and navigate to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "========================================"
echo "Docker Compose Configuration Tests"
echo "========================================"
echo ""

# Test: docker-compose.yml exists
log_test "docker-compose.yml file exists"
if [ -f docker-compose.yml ]; then
    log_pass
else
    log_fail "docker-compose.yml not found"
fi

# Test: No obsolete version field
log_test "No obsolete 'version' field in docker-compose.yml"
if ! grep -q "^version:" docker-compose.yml; then
    log_pass
else
    log_fail "docker-compose.yml contains obsolete 'version' field"
fi

# Test: Valid YAML syntax
log_test "docker-compose.yml has valid YAML syntax"
if docker compose config >/dev/null 2>&1; then
    log_pass
else
    log_fail "Invalid YAML syntax"
fi

# Test: PostgreSQL service defined
log_test "PostgreSQL service is defined"
CONFIG=$(docker compose config 2>/dev/null)
if echo "$CONFIG" | grep -q "postgres:"; then
    log_pass
else
    log_fail "PostgreSQL service not found"
fi

# Test: PostgreSQL uses correct image
log_test "PostgreSQL uses postgres:16-alpine image"
if echo "$CONFIG" | grep -q "image: postgres:16-alpine"; then
    log_pass
else
    log_fail "Incorrect PostgreSQL image"
fi

# Test: Container name is set
log_test "Container name is journiful-postgres"
if grep -q "container_name: journiful-postgres" docker-compose.yml; then
    log_pass
else
    log_fail "Container name not set correctly"
fi

# Test: Environment variables are set
log_test "Required environment variables are defined"
ENV_OK=true
for var in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB; do
    if ! grep -q "$var:" docker-compose.yml; then
        log_fail "$var not defined"
        ENV_OK=false
    fi
done
if [ "$ENV_OK" = true ]; then
    log_pass
fi

# Test: Port mapping is correct
log_test "Port mapping is 5433:5432"
if grep -q '"5433:5432"' docker-compose.yml; then
    log_pass
else
    log_fail "Incorrect port mapping"
fi

# Test: Volume is defined
log_test "Persistent volume is defined"
VOLUME_COUNT=$(grep -c "postgres_data:" docker-compose.yml || true)
if [ "$VOLUME_COUNT" -ge 2 ]; then
    log_pass
else
    log_fail "Persistent volume not properly defined"
fi

# Test: Health check is configured
log_test "Health check is configured"
if grep -q "healthcheck:" docker-compose.yml && grep -q "pg_isready" docker-compose.yml; then
    log_pass
else
    log_fail "Health check not configured"
fi

# Test: Health check has correct user
log_test "Health check uses correct PostgreSQL user"
if grep -q "pg_isready -U journiful" docker-compose.yml; then
    log_pass
else
    log_fail "Health check user incorrect"
fi

# Summary
echo ""
echo "========================================"
echo "Test Results"
echo "========================================"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo "========================================"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi
