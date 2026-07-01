#!/bin/bash
# Fallback sync: appends every /etc/caddy/tenants/*.caddy site block into
# the main Caddyfile if not already present, then reloads Caddy.
#
# Reason: the `import /etc/caddy/tenants/*.caddy` directive at the bottom
# of the main Caddyfile is silently ignored inside the Caddy container
# (matching zero files despite the bind mount showing them via `docker
# exec ls`). Appending the blocks directly always works.
#
# Idempotent — a host block already present is skipped.

set -e

CADDYFILE=/opt/top-alena/Caddyfile
TENANTS_DIR=/etc/caddy/tenants

if [ ! -d "$TENANTS_DIR" ]; then
  echo "==> $TENANTS_DIR does not exist, nothing to sync"
  exit 0
fi

APPENDED=0
for f in "$TENANTS_DIR"/*.caddy; do
  [ -f "$f" ] || continue
  slug=$(basename "$f" .caddy)
  host="${slug}.topalena.com"
  if grep -q "^${host} {" "$CADDYFILE"; then
    echo "==> $host already in Caddyfile"
  else
    echo "==> appending $host block"
    printf "\n" >> "$CADDYFILE"
    cat "$f" >> "$CADDYFILE"
    APPENDED=$((APPENDED + 1))
  fi
done

echo "==> reloading Caddy"
docker exec top-alena-caddy-1 caddy reload --config /etc/caddy/Caddyfile

sleep 3
echo "==> Caddy certs now:"
docker exec top-alena-caddy-1 ls /data/caddy/certificates/local/

echo "==> $APPENDED new block(s) appended"
