# TOP ALENA — Connect & Deploy Brief

How code changes get from the workstation to the live app. Hand this to any session that can't connect / deploy.

## The two locations
- **Local worktree (edit here):** `C:\Users\97253\top-alena-migration`, branch **`migration`**. This is production. (NOT `C:\Users\97253\TOP ALENA` — that's the old base44 tree, dead.)
- **Live server (VPS):** `root@91.98.45.253` (Hetzner, hostname `topalena`). App root: **`/opt/top-alena`**. Runs Docker Compose.

## App shape
- `apps/api/` — Fastify + Prisma backend (TypeScript). Container `top-alena-api-1`, listens on `localhost:3001`.
- `src/` (repo root) — React/Vite SPA (the "base44-compat" client talks to `/api`). Container `top-alena-web-1` serves the prebuilt `dist/`.
- `top-alena-minio-1` — file storage (MinIO). `top-alena-caddy-1` — reverse proxy / TLS.
- Multi-tenant: each other restaurant is its own container `tenant-<slug>-api` on the same VPS, sharing the image, with its own Postgres schema.

## Deploy pipeline (the whole thing)
```bash
# 1. LOCAL — make changes, then:
cd C:\Users\97253\top-alena-migration
#   BACKEND changes: nothing to prebuild.
#   FRONTEND changes: MUST build locally and commit dist (VPS has 2GB RAM, vite OOMs there):
npx vite build
git add -A
git commit -m "..."
git push origin migration

# 2. SERVER — pull + rebuild the changed containers:
ssh root@91.98.45.253 'cd /opt/top-alena && git fetch origin migration && git reset --hard origin/migration && docker compose up -d --build api web'
#   (use just `api` if only backend changed, `web` if only frontend.)
```

## Critical rules (break these and things silently fail)
1. **Frontend build is LOCAL.** Always `npx vite build` + commit `dist/` BEFORE pushing frontend changes. `dist/` is tracked in git on purpose. If you skip it, the server pulls new source but serves the STALE prebuilt bundle.
2. **NEVER run `prisma db push` on prod.** The live DB has legacy drift (old `created_by` columns on ~40 tables incl. Customer with 19k rows); db push wants to DROP them. Apply schema changes as **additive raw SQL** instead:
   ```bash
   # write CREATE TABLE IF NOT EXISTS / ALTER TABLE ... ADD COLUMN IF NOT EXISTS to a .sql file, scp it, then:
   docker compose exec -T api npx prisma db execute --stdin --schema prisma/schema.prisma < /tmp/change.sql
   ```
   Add the new model/field to `apps/api/prisma/schema.prisma` by hand too (do NOT run `npm run schema:build`).
3. **Tenant schemas need the same SQL.** Each tenant lives in `?schema=tenant_<slug>` on the same Postgres. Their container env has TWO `DATABASE_URL` lines — use the **LAST** one:
   ```bash
   for c in $(docker ps --format '{{.Names}}' | grep '^tenant-.*-api$'); do
     url=$(docker inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DATABASE_URL=' | tail -1 | cut -d= -f2-)
     docker compose exec -T api npx prisma db execute --stdin --url "$url" < /tmp/change.sql && echo "$c OK"
   done
   ```

## SSH is intermittent
Port 22 from this workstation sometimes times out (`Connection timed out`) — a transient network/ISP block, comes and goes over minutes. HTTPS/443 to the same host keeps working, so the server is alive.
- **Retry:** `ssh -o BatchMode=yes -o ConnectTimeout=10 root@91.98.45.253 'echo up'` — loop it every ~90s until it responds.
- **Fallback when SSH stays down:** the Hetzner web console (console.hetzner.cloud → server `topalena` → the `>_` terminal icon). Paste commands there. Note: it mangles special characters (`$`, `|`, quotes) — put anything complex in a committed script (`scripts/foo.sh`) and just run `git pull && bash scripts/foo.sh`.

## Verify a deploy landed
```bash
# frontend: the live bundle hash should match your fresh dist/
curl -s https://topalena.com/ | grep -oE 'index-[A-Za-z0-9_-]+\.js'
ls -t dist/assets/index-*.js | head -1   # compare
```

## Cron jobs
Server crontab hits internal HTTP endpoints with a shared secret:
```
*/10 * * * * curl -fsS -X POST -H "x-cron-secret: $(grep ^CRON_SECRET /opt/top-alena/apps/api/.env | cut -d= -f2-)" http://localhost:3001/api/cron/<name> >/dev/null 2>&1
```

## Env
`/opt/top-alena/apps/api/.env` holds secrets (CRON_SECRET, DATABASE_URL, GEMINI_API_KEY, TWILIO_*, EMAIL_TOKEN_ENC_KEY, GOOGLE_*, etc.). Add new keys with `grep -q KEY .env || echo "KEY=value" >> apps/api/.env`.
