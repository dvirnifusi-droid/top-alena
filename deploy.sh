#!/usr/bin/env bash
# One-shot production deploy for Top Alena on a fresh Ubuntu 24.04 VPS.
#
# Usage (on the VPS, as root):
#   curl -fsSL https://raw.githubusercontent.com/dvirnifusi-droid/top-alena/migration/deploy.sh | bash
# or:
#   git clone -b migration https://github.com/dvirnifusi-droid/top-alena.git /opt/top-alena
#   cd /opt/top-alena && DOMAIN=topalena.alenabepita.co.il bash deploy.sh
#
# Before running, set these env vars (or edit the values below):
#   DOMAIN   - the public hostname (default: topalena.alenabepita.co.il)
set -euo pipefail

DOMAIN="${DOMAIN:-topalena.alenabepita.co.il}"
REPO="https://github.com/dvirnifusi-droid/top-alena.git"
BRANCH="migration"
APP_DIR="/opt/top-alena"

echo "==> Deploying Top Alena to ${DOMAIN}"

# 1. Install Docker + compose plugin if missing
if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi

# 2. Clone or update the repo
if [ -d "${APP_DIR}/.git" ]; then
  echo "==> Updating existing checkout..."
  git -C "${APP_DIR}" fetch origin "${BRANCH}"
  git -C "${APP_DIR}" checkout "${BRANCH}"
  git -C "${APP_DIR}" pull --ff-only origin "${BRANCH}"
else
  echo "==> Cloning repo..."
  git clone -b "${BRANCH}" "${REPO}" "${APP_DIR}"
fi
cd "${APP_DIR}"

# 3. Root .env for docker-compose (DOMAIN + storage creds)
if [ ! -f .env ]; then
  echo "==> Creating root .env"
  cat > .env <<EOF
DOMAIN=${DOMAIN}
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$(openssl rand -hex 16)
POSTGRES_DB=topalena
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=$(openssl rand -hex 16)
VITE_API_BASE_URL=/api
EOF
fi

# 4. API .env must already contain DATABASE_URL, JWT_SECRET, GOOGLE_CLIENT_ID,
#    GEMINI_API_KEY and any integration keys. If missing, copy the template.
if [ ! -f apps/api/.env ]; then
  echo "!! apps/api/.env is missing."
  echo "!! Upload your apps/api/.env (with DATABASE_URL, JWT_SECRET, GOOGLE_CLIENT_ID, GEMINI_API_KEY) and re-run."
  exit 1
fi

# 5. Build + start everything. Caddy will obtain HTTPS for ${DOMAIN} automatically.
echo "==> Building and starting containers..."
docker compose up -d --build

echo ""
echo "==> Done. Once DNS for ${DOMAIN} points to this server's IP,"
echo "    the app will be live at: https://${DOMAIN}"
echo "    (Caddy fetches the TLS certificate automatically on first request.)"
