-- Phase 1 of docs/WOO-TOPALENA-ORDERS-SPEC.md
-- Additive only. `prisma db push` is forbidden on production here: the base44
-- import left drift, and push would try to "fix" it destructively.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS "WooOrder" (
  "id"            TEXT PRIMARY KEY,
  "wooOrderId"    INTEGER NOT NULL,
  "wooNumber"     TEXT NOT NULL,
  "stage"         TEXT NOT NULL DEFAULT 'received',
  "prepMinutes"   INTEGER,
  "promisedAt"    TIMESTAMP(3),
  "fulfillment"   TEXT NOT NULL DEFAULT 'delivery',
  "courierToken"  TEXT,
  "courierSentAt" TIMESTAMP(3),
  "customerName"  TEXT NOT NULL,
  "customerPhone" TEXT,
  "address"       TEXT,
  "total"         TEXT NOT NULL,
  "items"         JSONB NOT NULL,
  "placedAt"      TIMESTAMP(3) NOT NULL,
  "syncedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError"     TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "WooOrder_wooOrderId_key"   ON "WooOrder"("wooOrderId");
CREATE UNIQUE INDEX IF NOT EXISTS "WooOrder_courierToken_key" ON "WooOrder"("courierToken");
CREATE INDEX        IF NOT EXISTS "WooOrder_stage_placedAt_idx" ON "WooOrder"("stage", "placedAt");

CREATE TABLE IF NOT EXISTS "WooOrderEvent" (
  "id"         TEXT PRIMARY KEY,
  "wooOrderId" INTEGER NOT NULL,
  "stage"      TEXT NOT NULL,
  "actorId"    TEXT,
  "actorName"  TEXT NOT NULL,
  "at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "WooOrderEvent_wooOrderId_at_idx" ON "WooOrderEvent"("wooOrderId", "at");
