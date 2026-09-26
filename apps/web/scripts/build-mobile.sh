#!/usr/bin/env bash
set -euo pipefail

# Build the frozen web app as a static export (out/). Capacitor is gone:
# nothing ships this to a device any more, and this script stays because
# `test-static-smoke` builds it — that smoke test is the only check on the
# rollback target's artifact.

echo "Building the Journiful web app (static export)..."
export NEXT_EXPORT=true
cd "$(dirname "$0")/.."

if [ -z "${NEXT_PUBLIC_API_URL:-}" ]; then
  echo "⚠️  NEXT_PUBLIC_API_URL is not set — API calls will use default (likely localhost)."
  echo "   For distribution builds, set: NEXT_PUBLIC_API_URL=https://api.journiful.app/api"
fi

npx next build --webpack

# The path rewrite is a no-op for the served web app (relative paths still
# resolve over http) and it is what keeps the artifact usable from file://,
# which is how the old shell loaded it. Harmless, and removing it would
# change the rollback artifact for no gain.
bash "$(dirname "$0")/fix-asset-paths.sh"

echo ""
echo "Static export complete: out/index.html"
ls -lh out/index.html
