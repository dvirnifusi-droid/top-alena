#!/bin/bash
# Generates a wildcard self-signed cert for *.topalena.com if not present.
# Idempotent — safe to run every autodeploy tick. Solves the "tls internal
# sometimes doesn't provision a cert on first Cloudflare hit → 525 error"
# bug that hit every new tenant. Cloudflare in "Full" (not "Full Strict")
# mode accepts self-signed origin certs, so a static wildcard cert on
# disk works identically to `tls internal` but WITHOUT the on-demand race.
#
# Once this cert is in place, every tenant block in Caddyfile can use it
# via `tls /etc/caddy/certs/wildcard.crt /etc/caddy/certs/wildcard.key`.
# The cert covers *.topalena.com so ONE cert handles every tenant slug.
#
# 10-year validity — no renewal needed within the product's lifetime.

set -uo pipefail
CERTS_DIR=/etc/caddy/certs
CERT=$CERTS_DIR/wildcard.crt
KEY=$CERTS_DIR/wildcard.key

mkdir -p "$CERTS_DIR"

if [ -f "$CERT" ] && [ -f "$KEY" ]; then
  # Cert exists. Check it's still valid for > 30 days — if it's about
  # to expire we regenerate proactively.
  if openssl x509 -in "$CERT" -noout -checkend 2592000 >/dev/null 2>&1; then
    exit 0
  fi
  echo "==> wildcard cert expiring soon, regenerating"
fi

echo "==> generating wildcard self-signed cert for *.topalena.com"
openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout "$KEY" -out "$CERT" \
  -subj "/CN=*.topalena.com/O=TopAlena/C=IL" \
  -addext "subjectAltName=DNS:*.topalena.com,DNS:topalena.com" \
  2>/dev/null

chmod 644 "$CERT"
chmod 600 "$KEY"

echo "==> wildcard cert generated. Migrating existing tls-internal blocks."

# Rewrite every `tls internal` line in the main Caddyfile AND every
# per-tenant block to point at the new static cert. Backup first.
CADDYFILE=/opt/top-alena/Caddyfile
TENANTS_DIR=/etc/caddy/tenants
TLS_LINE="tls /etc/caddy/certs/wildcard.crt /etc/caddy/certs/wildcard.key"

if [ -f "$CADDYFILE" ]; then
  cp "$CADDYFILE" "${CADDYFILE}.bak-$(date +%s)"
  # Match `tls internal` with any leading whitespace, preserve indentation.
  sed -i -E "s|^([[:space:]]*)tls internal[[:space:]]*$|\1${TLS_LINE}|" "$CADDYFILE"
  echo "==> $CADDYFILE migrated"
fi

if [ -d "$TENANTS_DIR" ]; then
  for f in "$TENANTS_DIR"/*.caddy; do
    [ -f "$f" ] || continue
    if grep -q "tls internal" "$f"; then
      cp "$f" "${f}.bak-$(date +%s)"
      sed -i -E "s|^([[:space:]]*)tls internal[[:space:]]*$|\1${TLS_LINE}|" "$f"
      echo "==> $f migrated"
    fi
  done
fi

echo "==> restarting Caddy to load new cert + config"
docker restart top-alena-caddy-1 >/dev/null 2>&1 || true

# Wait for Caddy to come back on 443
for i in 1 2 3 4 5 6 7 8 9 10; do
  if docker exec top-alena-caddy-1 sh -c 'ss -lnt 2>/dev/null | grep -q :443 || netstat -lnt 2>/dev/null | grep -q :443' 2>/dev/null; then
    echo "==> Caddy back on :443 after ${i}s"
    exit 0
  fi
  sleep 1
done
echo "==> WARNING: Caddy did not come back on :443 within 10s"
