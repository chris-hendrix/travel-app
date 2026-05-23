#!/usr/bin/env bash
set -euo pipefail

# Build the Next.js app for Capacitor static export
# Sets NEXT_EXPORT=true to produce out/ directory

echo "Building Journiful for mobile (static export)..."
export NEXT_EXPORT=true
cd "$(dirname "$0")/.."

npx next build --webpack

echo ""
echo "Static export complete: out/index.html"
ls -lh out/index.html
