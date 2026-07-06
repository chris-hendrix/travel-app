#!/usr/bin/env bash
set -euo pipefail

# fix-asset-paths.sh
# Post-process Next.js static export for Capacitor compatibility.
# Next.js emits absolute asset paths (/_next/static/...), but Capacitor
# loads from file:///android_asset/public/ where absolute paths resolve
# from filesystem root (file:///_next/...) instead of the page directory.
#
# This script rewrites paths to be relative so they work under file:// protocol.

OUT_DIR="$(dirname "$0")/../out"

echo "Fixing asset paths for Capacitor file:// compatibility..."

# 1. Root-level HTML files (index.html, login.html, etc.)
#    /_next/static/... → ./_next/static/...
echo "  Fixing root-level .html files..."
find "$OUT_DIR" -maxdepth 1 -name "*.html" -print0 | while IFS= read -r -d '' f; do
  sed -i 's|"/_next/|"./_next/|g' "$f"
  sed -i "s|'/_next/|'./_next/|g" "$f"
done

# 2. Root-level .txt files (RSC data payloads loaded via fetch)
#    /_next/static/... → ./_next/static/...
echo "  Fixing root-level .txt files..."
find "$OUT_DIR" -maxdepth 1 -name "*.txt" -print0 | while IFS= read -r -d '' f; do
  sed -i 's|"/_next/|"./_next/|g' "$f"
  sed -i "s|'/_next/|'./_next/|g" "$f"
  # Also fix the :HL entries in RSC payload (no quotes, just /_next/...)
  sed -i 's|:HL\["/_next/|:HL["./_next/|g' "$f"
done

# 3. Subdirectory .txt files (e.g., trips/..., login/...)
#    Need ../ prefix based on directory depth. Skip _next/ build artifacts.
echo "  Fixing subdirectory .txt files..."
find "$OUT_DIR" -mindepth 2 -name "*.txt" -not -path "*/_next/*" -print0 | while IFS= read -r -d '' f; do
  rel="${f#$OUT_DIR/}"
  depth=$(echo "$rel" | tr -cd '/' | wc -c)
  prefix=
  i=0
  while [ "$i" -lt "$depth" ]; do prefix="$prefix../"; i=$((i+1)); done
  sed -i "s|\"/_next/|\"${prefix}_next/|g" "$f"
  sed -i "s|'/_next/|'${prefix}_next/|g" "$f"
  sed -i "s|:HL\\[\"/_next/|:HL[\"${prefix}_next/|g" "$f"
done

# 4. Subdirectory .html files (rarely loaded, but fix for completeness). Skip _next/.
echo "  Fixing subdirectory .html files..."
find "$OUT_DIR" -mindepth 2 -name "*.html" -not -path "*/_next/*" -print0 | while IFS= read -r -d '' f; do
  rel="${f#$OUT_DIR/}"
  depth=$(echo "$rel" | tr -cd '/' | wc -c)
  prefix=
  i=0
  while [ "$i" -lt "$depth" ]; do prefix="$prefix../"; i=$((i+1)); done
  sed -i "s|\"/_next/|\"${prefix}_next/|g" "$f"
  sed -i "s|'/_next/|'${prefix}_next/|g" "$f"
done

# 5. CSS files: fonts are at ../../media/ relative to _next/static/css/
echo "  Fixing CSS font references..."
find "$OUT_DIR/_next/static/css" -name "*.css" -print0 | while IFS= read -r -d '' f; do
  sed -i 's|/_next/static/media/|../media/|g' "$f"
done

# 6. JS files: check and fix any asset path references
echo "  Checking JS files..."
if grep -rq '"/_next/static/' "$OUT_DIR/_next/static/chunks/" 2>/dev/null; then
  echo "    Warning: JS chunks contain absolute asset paths - fixing..."
  find "$OUT_DIR/_next/static/chunks" -name "*.js" -print0 | while IFS= read -r -d '' f; do
    sed -i '/sourceMappingURL/!s|"/_next/static/|"./_next/static/|g' "$f"
    sed -i "/sourceMappingURL/!s|'/_next/static/|'./_next/static/|g" "$f"
  done
else
  echo "    No absolute paths in JS chunks (good)"
fi

echo "Done. Asset paths are now Capacitor-compatible."
