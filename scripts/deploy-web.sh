#!/usr/bin/env bash
# Frontend deploy — build + commit the WHOLE dist so no referenced asset 404s.
#
# WHY THIS EXISTS: dist/ is gitignored and autodeploy ships the committed dist
# verbatim (no server build). Committing only the JS bundle by name (the old
# habit) meant that when a change altered the CSS hash, index.html pointed at a
# CSS file that was never committed → 404 → the entire UI rendered unstyled.
# This script re-syncs the entire tracked dist to the fresh build every time.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> vite build"
npx vite build

echo "==> re-sync tracked dist to the fresh build (removes stale hashes, adds new)"
git rm -r --cached --quiet dist 2>/dev/null || true
git add -f dist

# Sanity: every asset index.html references must exist on disk before we ship.
missing=0
for ref in $(grep -oE '/assets/[^"]+\.(js|css)' dist/index.html | sort -u); do
  if [ ! -f "dist${ref}" ]; then echo "!! MISSING dist${ref}"; missing=1; fi
done
[ "$missing" = "0" ] || { echo "ABORT: index.html references a missing asset"; exit 1; }
echo "==> all referenced assets present. Stage the rest of your changes, commit and push."
