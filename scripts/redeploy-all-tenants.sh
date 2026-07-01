#!/usr/bin/env bash
# Redeploy every tenant API container so it picks up a freshly-built
# top-alena-api:latest image.
#
# Why this exists:
#   `docker compose up -d --build` rebuilds the main (Alena) container and
#   moves the top-alena-api:latest tag onto the new image. But every tenant
#   container spawned by scripts/provision-tenant.sh was started with
#   `docker run ... top-alena-api:latest` and now references the OLD image
#   ID by internal identity. `docker restart` won't help — it re-runs the
#   same image. We have to `docker rm` + `docker run` with the same env to
#   get the new image.
#
# Idempotent — safe to run every deploy.
#
# Called at the end of setup-autodeploy.sh's worker, after compose rebuild.

set -euo pipefail

echo "==> Scanning for tenant containers to redeploy..."

# Every tenant container was started with image top-alena-api:latest.
# Exclude the compose-managed main container ("top-alena-api-1" — compose
# will already have rebuilt it).
CONTAINERS=$(docker ps -a --format '{{.Names}}\t{{.Image}}' \
  | awk -F'\t' '$2 == "top-alena-api:latest" && $1 != "top-alena-api-1" { print $1 }')

if [ -z "$CONTAINERS" ]; then
  echo "==> No tenant containers found. Nothing to do."
  exit 0
fi

# One line per container.
for NAME in $CONTAINERS; do
  echo ""
  echo "==> Redeploying tenant container: $NAME"

  # Capture the running config before killing it. docker inspect is JSON.
  # We only need env, network, and the restart policy — the image tag is
  # fixed at top-alena-api:latest (which is what we're upgrading to).
  ENV_LINES=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$NAME")
  NETWORK=$(docker inspect --format '{{range $k, $_ := .NetworkSettings.Networks}}{{$k}}{{end}}' "$NAME")

  # Preserve custom envs (TENANT_SLUG, TENANT_SCHEMA, DATABASE_URL) but drop
  # generic image defaults (HOSTNAME, PATH, NODE_*, YARN_*, HOME) — they'll
  # be reset by the image on boot.
  ENV_ARGS=()
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    case "$line" in
      HOSTNAME=*|PATH=*|HOME=*|NODE_VERSION=*|YARN_VERSION=*|_=*|LANG=*|LC_*) continue ;;
    esac
    ENV_ARGS+=("-e" "$line")
  done <<< "$ENV_LINES"

  # Fall back to top-alena_default if the container was somehow disconnected.
  : "${NETWORK:=top-alena_default}"

  echo "   network: $NETWORK  |  envs: ${#ENV_ARGS[@]} vars"

  # Kill + recreate. The env vars come from `docker inspect`, so DATABASE_URL,
  # TENANT_SLUG, and TENANT_SCHEMA all survive. --env-file re-applies the
  # shared secrets (JWT_SECRET, GEMINI_API_KEY, etc.) from apps/api/.env.
  ENV_FILE="/opt/top-alena/apps/api/.env"
  if [ ! -f "$ENV_FILE" ]; then
    # Fallback to whatever directory the autodeploy worker uses.
    ENV_FILE="$(find /root /opt -maxdepth 4 -name '.env' -path '*/apps/api/*' 2>/dev/null | head -1)"
  fi

  ENVFILE_ARG=()
  if [ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ]; then
    ENVFILE_ARG=(--env-file "$ENV_FILE")
  fi

  docker rm -f "$NAME" >/dev/null
  docker run -d \
    --name "$NAME" \
    --restart unless-stopped \
    --network "$NETWORK" \
    "${ENVFILE_ARG[@]}" \
    "${ENV_ARGS[@]}" \
    top-alena-api:latest >/dev/null

  echo "   ✅ $NAME redeployed on fresh image"
done

echo ""
echo "==> All tenant containers redeployed."
