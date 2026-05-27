# Top Alena - Self-Hosted Deployment Guide

This repo was originally built on **Base44**. The new layout makes it runnable
on any private VPS without Base44.

```
top-alena/
├── src/                # Vite + React frontend (existing, unchanged pages)
├── apps/api/           # NEW Fastify + Prisma backend that replaces Base44
├── base44/             # Original Base44 entities + Deno functions (kept for reference)
├── docker-compose.yml  # postgres + minio + api + web + caddy
├── Dockerfile.web      # builds the Vite frontend behind nginx
└── Caddyfile           # reverse proxy + automatic HTTPS
```

## Prerequisites

- A Linux VPS (Hetzner CX22, DigitalOcean $6, etc.) - 2 GB RAM is enough to start.
- Docker + Docker Compose plugin.
- A domain name pointing to the VPS (for HTTPS).
- API keys for the integrations you use (Twilio, Pushover, Gemini, Resend, …).

## One-time local setup

```bash
# 1. install Node 20+ if you want to run anything outside docker
#    https://nodejs.org/  (or use nvm)

# 2. install frontend deps
npm install

# 3. install API deps and generate prisma schema
cd apps/api
cp .env.example .env        # fill in JWT_SECRET + integration keys
npm install
npm run schema:build        # converts base44/entities/*.jsonc -> prisma/schema.prisma
npm run prisma:generate
```

## Run locally (without docker)

```bash
# Terminal 1 - postgres + minio (or use docker-compose up postgres minio)
docker compose up postgres minio

# Terminal 2 - API
cd apps/api
npm run prisma:migrate -- --name init
npm run dev               # http://localhost:3001

# Terminal 3 - frontend
# The Vite dev server proxies /api to http://localhost:3001 automatically
# (see `server.proxy` in vite.config.js). No .env.local needed for local dev.
# To point the proxy at a different host, set VITE_API_PROXY_TARGET.
npm run dev               # http://localhost:5173
```

## Deploy on the VPS

```bash
git clone <repo> /opt/top-alena
cd /opt/top-alena
cp .env.example .env                  # set DOMAIN, POSTGRES_PASSWORD
cp apps/api/.env.example apps/api/.env # fill in JWT_SECRET + all integration keys
docker compose up -d --build
```

Caddy will automatically obtain a Let's Encrypt cert for the domain you set.

## Data migration from Base44

While Base44 is still alive, dump everything:

```bash
cd apps/api
# Grab your access token from the browser:
# devtools → Application → Local Storage → key `base44_access_token`
BASE44_TOKEN="<paste-token-here>" \
VITE_BASE44_APP_ID=<app-id> \
VITE_BASE44_APP_BASE_URL=https://<your-app>.base44.app \
npm run export:base44

# Then, after `prisma migrate deploy` against the new Postgres:
npm run seed
```

This produces JSON dumps under `apps/api/scripts/seed-data/<EntityName>.json`
and loads them with id-preserving upserts.

## First admin user

```bash
cd apps/api
npm run admin:create -- you@example.com YourStrongPassword
```

Or do everything (schema + migrate + admin) in one shot:

```bash
npm run setup -- you@example.com YourStrongPassword
```

## What's left to do (TODO)

Most of the original TODO list has been completed. Current state:

**Done:**
- All Base44 function handlers ported in `apps/api/src/functions/load.ts`
  (Twilio SMS/WhatsApp, Pushover, Telegram, Gemini/LLM, coins, ElevenLabs TTS,
  Instagram Graph publishing, customer/queue helpers, gameseeding, newsletter,
  shortenUrl, etc.).
- Front-end `AuthProvider` wired to `base44.auth.login()` against `/api/auth/login`.
- `/login` page exists and is routed in [src/App.jsx](src/App.jsx).
- Vite dev proxy for `/api` → `http://localhost:3001` (no Mixed Content in dev).

**Still TODO:**
- **Google Drive integration** — `getDriveImageUrl`, `getDriveImages` are intentional
  stubs in `load.ts` that throw. Needs a Google service account + Drive API client.
- **Stripe checkout / webhooks** — frontend imports `@stripe/react-stripe-js` but
  the backend has no `/api/integrations/stripe-*` routes yet.
- **Auth model decision** — current `/login` is email+password. Decide if you want
  invite-only, Google OAuth, or SMS OTP, and adjust `apps/api/src/routes/auth.ts`
  + the Login UI.
- **Real Base44 data export** — `apps/api/scripts/export-from-base44.ts` exists
  but needs to be run against the live Base44 app with a token, then
  `npm run seed` against the new Postgres.
- **HTTPS in production** — Caddy already handles it via the `DOMAIN` env var.
  Just set it in `.env` before `docker compose up`.

## How the migration works at a glance

| Was | Now |
|---|---|
| `@base44/sdk` createClient | [`src/api/base44Client.js`](src/api/base44Client.js) - drop-in shim |
| `base44.entities.Customer.list()` | `GET /api/entities/Customer` |
| `base44.integrations.Core.UploadFile` | `POST /api/integrations/upload-file` (MinIO/S3) |
| `base44.integrations.Core.InvokeLLM` | `POST /api/integrations/invoke-llm` (Gemini) |
| `base44.functions.sendQueueSms` | `POST /api/fn/sendQueueSms` (Twilio) |
| Base44 Auth UI | [`/login` page](src/pages/Login.jsx) + JWT via `/api/auth/login` |
| Base44 storage | MinIO bucket (S3-compatible) |
| Base44 Postgres | Self-hosted Postgres 16 |
