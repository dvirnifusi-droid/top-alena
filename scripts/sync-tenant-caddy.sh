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
NEW_HOSTS=()
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
    NEW_HOSTS+=("$host")
  fi
done

# For new hostnames we MUST restart Caddy — `caddy reload` is silently
# unreliable for adding `tls internal` hostnames: the reload succeeds but
# subsequent TLS handshakes to the new hostname get "internal error alert
# 80" because the cert never actually gets provisioned into the running
# state. A full container restart always works. Tradeoff: ~2s downtime for
# every OTHER tenant while Caddy comes back up. That's acceptable during
# a provision.
#
# For zero-change syncs (a re-run where nothing was appended) we skip the
# restart entirely to avoid pointless downtime.
if [ "$APPENDED" -gt 0 ]; then
  echo "==> restarting Caddy (needed for new tls internal hostnames)"
  docker restart top-alena-caddy-1

  # Wait for Caddy to be back on 443 before we try to warm.
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if docker exec top-alena-caddy-1 sh -c 'ss -lnt 2>/dev/null | grep -q :443 || netstat -lnt 2>/dev/null | grep -q :443'; then
      echo "==> Caddy is back on :443 after ${i}s"
      break
    fi
    sleep 1
  done

  # Warm each newly-added hostname so the first Cloudflare probe doesn't
  # race the initial cert provisioning. We loop until we stop seeing
  # HTTP 000 / TLS error, or give up after 6 tries per host.
  for host in "${NEW_HOSTS[@]}"; do
    echo "==> warming TLS for $host"
    for i in 1 2 3 4 5 6; do
      code=$(curl -sk --resolve "${host}:443:127.0.0.1" \
        -o /dev/null -w '%{http_code}' --max-time 10 \
        "https://${host}/" 2>/dev/null || echo 000)
      echo "    attempt $i: HTTP $code"
      case "$code" in
        000|525) sleep 2 ;;
        *) break ;;
      esac
    done
  done
else
  echo "==> no new blocks — skipping Caddy restart"
fi

sleep 2
echo "==> Caddy certs now:"
docker exec top-alena-caddy-1 ls /data/caddy/certificates/local/ 2>/dev/null || true

echo "==> $APPENDED new block(s) appended"
