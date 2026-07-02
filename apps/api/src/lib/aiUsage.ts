// D5 — AI Usage metering.
//
// Every Gemini / Anthropic call goes through invokeLLM in lib/llm.ts. We
// instrument that entry point to write one row per call into
// platform.AiUsage — tenant, function, model, tokens, cost. Then the
// tenant's /PlatformSettings shows their monthly consumption, and
// /PlatformAdmin sees a cross-tenant breakdown for capacity planning.
//
// Writes are fire-and-forget so a Postgres hiccup never breaks a chat
// response. Prices are hardcoded per known model — update the table
// when Google/Anthropic change pricing.

import { prisma } from '../db.js';
import { currentTenantSlug } from './whatsappRouter.js';

// USD → ILS conversion. Real-time FX not worth wiring up for accounting-
// grade cost estimation. Update quarterly or when the shekel drifts >10%.
const USD_ILS = 3.6;

// Cost in USD per 1M tokens (input, output). Source: publicly announced
// pricing pages. Numbers rounded to keep the table readable.
type ModelPrice = { in_usd_per_m: number; out_usd_per_m: number };
const MODEL_PRICING: Record<string, ModelPrice> = {
  'gemini-2.5-flash':      { in_usd_per_m: 0.075, out_usd_per_m: 0.30 },
  'gemini-2.5-flash-lite': { in_usd_per_m: 0.05,  out_usd_per_m: 0.20 },
  'gemini-2.5-pro':        { in_usd_per_m: 1.25,  out_usd_per_m: 5.00 },
  'gemini-2.0-flash':      { in_usd_per_m: 0.10,  out_usd_per_m: 0.40 },
  'claude-sonnet-4-5':     { in_usd_per_m: 3.00,  out_usd_per_m: 15.00 },
  'claude-sonnet-4-6':     { in_usd_per_m: 3.00,  out_usd_per_m: 15.00 },
  'claude-opus-4-8':       { in_usd_per_m: 15.00, out_usd_per_m: 75.00 },
  'claude-haiku-4-5':      { in_usd_per_m: 0.80,  out_usd_per_m: 4.00 },
};
const FALLBACK_PRICING: ModelPrice = { in_usd_per_m: 0.10, out_usd_per_m: 0.40 };

function computeCostIls(model: string, tokensIn: number, tokensOut: number): number {
  const p = MODEL_PRICING[model] || FALLBACK_PRICING;
  const usd = (tokensIn / 1_000_000) * p.in_usd_per_m + (tokensOut / 1_000_000) * p.out_usd_per_m;
  return usd * USD_ILS;
}

let _aiUsageTableReady = false;
async function ensureAiUsageTable() {
  if (_aiUsageTableReady) return;
  await (prisma as any).$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "platform"`);
  await (prisma as any).$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "platform"."AiUsage" (
      "id" BIGSERIAL PRIMARY KEY,
      "tenant_slug" TEXT NOT NULL,
      "fn_name" TEXT NOT NULL,
      "model" TEXT NOT NULL,
      "tokens_in" INTEGER NOT NULL DEFAULT 0,
      "tokens_out" INTEGER NOT NULL DEFAULT 0,
      "cost_ils" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "day" DATE NOT NULL DEFAULT CURRENT_DATE,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await (prisma as any).$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "AiUsage_tenant_day_idx" ON "platform"."AiUsage"("tenant_slug", "day")`,
  );
  _aiUsageTableReady = true;
}

export type AiUsageWrite = {
  fn_name?: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  tenant_slug?: string; // defaults to currentTenantSlug()
};

/**
 * Fire-and-forget write. Any error is swallowed with a warning — an LLM
 * response must never fail because usage logging couldn't reach Postgres.
 */
export async function writeAiUsage(w: AiUsageWrite): Promise<void> {
  try {
    await ensureAiUsageTable();
    const tenant = (w.tenant_slug || currentTenantSlug()).toLowerCase();
    const fn = w.fn_name || 'unknown';
    const model = w.model || 'unknown';
    const tokensIn = Math.max(0, Math.floor(w.tokens_in || 0));
    const tokensOut = Math.max(0, Math.floor(w.tokens_out || 0));
    const cost = computeCostIls(model, tokensIn, tokensOut);
    await (prisma as any).$executeRawUnsafe(
      `INSERT INTO "platform"."AiUsage" ("tenant_slug","fn_name","model","tokens_in","tokens_out","cost_ils","day")
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE)`,
      tenant, fn, model, tokensIn, tokensOut, cost,
    );
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn('[aiUsage] write failed:', e?.message);
  }
}

/**
 * Get the tenant's usage for the current calendar month. Returns rollups by
 * day and by function so a widget can render totals + a small chart.
 */
export async function getMyMonthlyUsage(tenantSlug?: string): Promise<{
  total_tokens: number;
  total_cost_ils: number;
  by_day: { day: string; tokens: number; cost_ils: number }[];
  by_fn: { fn_name: string; tokens: number; cost_ils: number; calls: number }[];
}> {
  try {
    await ensureAiUsageTable();
    const tenant = (tenantSlug || currentTenantSlug()).toLowerCase();
    const byDay: any[] = await (prisma as any).$queryRawUnsafe(
      `SELECT day::text AS day,
              COALESCE(SUM(tokens_in + tokens_out), 0)::int AS tokens,
              COALESCE(SUM(cost_ils), 0)::float AS cost_ils
       FROM "platform"."AiUsage"
       WHERE tenant_slug = $1 AND day >= date_trunc('month', CURRENT_DATE)
       GROUP BY day ORDER BY day ASC`,
      tenant,
    );
    const byFn: any[] = await (prisma as any).$queryRawUnsafe(
      `SELECT fn_name,
              COALESCE(SUM(tokens_in + tokens_out), 0)::int AS tokens,
              COALESCE(SUM(cost_ils), 0)::float AS cost_ils,
              COUNT(*)::int AS calls
       FROM "platform"."AiUsage"
       WHERE tenant_slug = $1 AND day >= date_trunc('month', CURRENT_DATE)
       GROUP BY fn_name ORDER BY cost_ils DESC`,
      tenant,
    );
    const totalTokens = byDay.reduce((s, r) => s + Number(r.tokens || 0), 0);
    const totalCost = byDay.reduce((s, r) => s + Number(r.cost_ils || 0), 0);
    return {
      total_tokens: totalTokens,
      total_cost_ils: Number(totalCost.toFixed(4)),
      by_day: byDay.map(r => ({ day: String(r.day), tokens: Number(r.tokens || 0), cost_ils: Number(r.cost_ils || 0) })),
      by_fn: byFn.map(r => ({ fn_name: String(r.fn_name), tokens: Number(r.tokens || 0), cost_ils: Number(r.cost_ils || 0), calls: Number(r.calls || 0) })),
    };
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn('[aiUsage] getMyMonthlyUsage failed:', e?.message);
    return { total_tokens: 0, total_cost_ils: 0, by_day: [], by_fn: [] };
  }
}
