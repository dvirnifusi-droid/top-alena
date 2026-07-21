// notificationSettings.ts
// ---------------------------------------------------------------------------
// The per-tenant override layer for the notification registry.
//
// A single isolated table, `NotificationSetting`, one row per message key,
// created with additive SQL and read with raw SQL (prisma db push is forbidden
// on prod, so this table is invisible to the Prisma client — same pattern as
// MarketingPixelSetting/EventThanksSetting in functions/eventThanks.ts).
//
// GUARANTEE: an empty table = today's behavior, exactly. Every read falls back
// to the registry default, and every send site keeps its own current string as
// the fallback — the owner's text is used ONLY when a row overrides it.
// ---------------------------------------------------------------------------
import { prisma } from '../db.js';
import { NOTIFICATIONS, byKey, applyTokens } from './notificationRegistry.js';
const dbx = () => prisma;
// ── table bootstrap (once per process) ──────────────────────────────────────
let _ensured = false;
async function ensureTable() {
    if (_ensured)
        return;
    await dbx().$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "NotificationSetting" (
      key           TEXT PRIMARY KEY,
      enabled       BOOLEAN,
      custom_text   TEXT,
      schedule_json JSONB,
      updated_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_by    TEXT
    )`).catch(() => { });
    _ensured = true;
}
// ── 60s cache of the whole (small) table ────────────────────────────────────
let _cache = null;
const CACHE_MS = 60_000;
async function loadRows() {
    if (_cache && Date.now() - _cache.at < CACHE_MS)
        return _cache.rows;
    await ensureTable();
    const rows = await dbx().$queryRawUnsafe(`SELECT key, enabled, custom_text, schedule_json FROM "NotificationSetting"`).catch(() => []);
    const map = new Map();
    for (const r of rows || []) {
        map.set(r.key, {
            key: r.key,
            enabled: r.enabled === null || r.enabled === undefined ? null : !!r.enabled,
            custom_text: r.custom_text ?? null,
            // pg returns JSONB already parsed; guard against a string just in case.
            schedule_json: typeof r.schedule_json === 'string'
                ? safeParse(r.schedule_json)
                : (r.schedule_json ?? null),
        });
    }
    _cache = { at: Date.now(), rows: map };
    return map;
}
function safeParse(s) { try {
    return JSON.parse(s);
}
catch {
    return null;
} }
function invalidate() { _cache = null; }
// ── runtime reads (used at send sites) ──────────────────────────────────────
/** Is this message allowed to send? Defaults to the registry (true) when unset. */
export async function isNotifEnabled(key) {
    try {
        const row = (await loadRows()).get(key);
        if (row && row.enabled !== null)
            return row.enabled;
    }
    catch { /* fail open — never block a send on a settings-table hiccup */ }
    return byKey(key)?.defaultEnabled ?? true;
}
/** The owner's custom template for this message, or null if they never edited it. */
export async function notifOverrideText(key) {
    try {
        const t = (await loadRows()).get(key)?.custom_text;
        return t && String(t).trim() ? String(t) : null;
    }
    catch {
        return null;
    }
}
/**
 * Resolve the text to send. Pass the site's EXISTING exact string as `fallback`
 * — it is returned verbatim unless the owner has overridden this message, in
 * which case their template is rendered with `vars`. This is what keeps
 * un-edited tenants byte-identical to today.
 */
export async function notifText(key, fallback, vars = {}) {
    const override = await notifOverrideText(key);
    return override ? applyTokens(override, vars) : fallback;
}
/** Effective schedule for a message: owner override → registry default → caller fallback. */
export async function notifSchedule(key, fallback) {
    const def = byKey(key)?.defaultSchedule;
    let override = null;
    try {
        override = (await loadRows()).get(key)?.schedule_json ?? null;
    }
    catch { /* fall through */ }
    return override || def || fallback || {};
}
/** The wall-clock "HH:mm" a per-weekday message should fire on (Israel dow 0..6). */
export async function notifSlot(key, dow, fallbackSlots) {
    const sched = await notifSchedule(key, { slots: fallbackSlots });
    const slots = sched.slots || fallbackSlots;
    return slots[String(dow)] ?? null;
}
/** The "HH:mm" a single-time message should fire on. */
export async function notifTime(key, fallback) {
    const sched = await notifSchedule(key, { time: fallback });
    return sched.time || fallback;
}
/** The full list for the settings page: registry merged with any overrides. */
export async function listNotifSettings() {
    const rows = await loadRows();
    return NOTIFICATIONS.map((def) => {
        const row = rows.get(def.key);
        const enabled = row && row.enabled !== null ? row.enabled : (def.defaultEnabled ?? true);
        return {
            ...def,
            enabled,
            custom_text: row?.custom_text ?? null,
            schedule: row?.schedule_json || def.defaultSchedule || {},
            overridden: {
                enabled: !!(row && row.enabled !== null),
                text: !!(row && row.custom_text),
                schedule: !!(row && row.schedule_json),
            },
        };
    });
}
/** Upsert one message's overrides. Only the fields present in `patch` change. */
export async function setNotifSetting(key, patch, userId) {
    const def = byKey(key);
    if (!def)
        throw new Error('unknown notification key');
    await ensureTable();
    // Merge onto the existing row so an unspecified field is preserved.
    const existing = (await dbx().$queryRawUnsafe(`SELECT enabled, custom_text, schedule_json FROM "NotificationSetting" WHERE key = $1`, key).catch(() => []))?.[0] || {};
    let enabled = existing.enabled ?? null;
    if (patch.enabled !== undefined)
        enabled = !!patch.enabled;
    let text = existing.custom_text ?? null;
    if (patch.custom_text !== undefined) {
        const t = patch.custom_text == null ? '' : String(patch.custom_text).slice(0, 2000).trim();
        text = t ? t : null;
    }
    let schedule = typeof existing.schedule_json === 'string'
        ? safeParse(existing.schedule_json)
        : (existing.schedule_json ?? null);
    if (patch.schedule_json !== undefined) {
        schedule = patch.schedule_json ? sanitizeSchedule(def, patch.schedule_json) : null;
    }
    await dbx().$executeRawUnsafe(`INSERT INTO "NotificationSetting" (key, enabled, custom_text, schedule_json, updated_at, updated_by)
     VALUES ($1, $2, $3, $4::jsonb, NOW(), $5)
     ON CONFLICT (key) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       custom_text = EXCLUDED.custom_text,
       schedule_json = EXCLUDED.schedule_json,
       updated_at = NOW(),
       updated_by = EXCLUDED.updated_by`, key, enabled, text, schedule ? JSON.stringify(schedule) : null, userId || null).catch((e) => { throw new Error('save failed: ' + (e?.message || e)); });
    invalidate();
}
/** Revert one message entirely to its registry default (removes the row). */
export async function resetNotifSetting(key) {
    await ensureTable();
    await dbx().$executeRawUnsafe(`DELETE FROM "NotificationSetting" WHERE key = $1`, key).catch(() => { });
    invalidate();
}
// Keep only valid "HH:mm" values, and only the shape the message actually uses.
function sanitizeSchedule(def, s) {
    const hhmm = (v) => {
        const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? '').trim());
        if (!m)
            return null;
        const h = +m[1], mi = +m[2];
        if (h < 0 || h > 23 || mi < 0 || mi > 59)
            return null;
        return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
    };
    if (def.scheduleShape === 'time') {
        const t = hhmm(s?.time);
        return t ? { time: t } : null;
    }
    if (def.scheduleShape === 'slots') {
        const out = {};
        for (let d = 0; d <= 6; d++) {
            const t = hhmm(s?.slots?.[String(d)]);
            if (t)
                out[String(d)] = t;
        }
        return Object.keys(out).length ? { slots: out } : null;
    }
    return null; // 'none' — not schedulable
}
//# sourceMappingURL=notificationSettings.js.map