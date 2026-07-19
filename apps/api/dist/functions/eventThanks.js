// The event-inquiry thank-you page, and the campaign pixels that fire on it.
//
// Conversions used to be inferred from a score the AI gave its own conversation
// — which measures the model's opinion, not the customer's intent. Landing on a
// page the bot sent you to is an observable act, so that is what the ad
// platforms get told about.
//
// Everything here is reachable without a login (the visitor is a stranger), so
// the rule is: a long unguessable token, and a response containing only what
// that one visitor already told us. No conversation log, no internal score, no
// other leads.
import { registerFn } from './index.js';
import { prisma } from '../db.js';
import { randomBytes } from 'node:crypto';
const dbx = () => prisma;
const isAdminRole = (r) => r === 'owner' || r === 'admin';
async function ensureThanksSettings() {
    await dbx().$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "EventThanksSetting" (
      id TEXT PRIMARY KEY,
      video_url TEXT,
      video_title TEXT,
      response_text TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => { });
}
async function ensureLeadToken() {
    // Additive SQL only — prisma db push is forbidden on prod. The column is
    // therefore invisible to the Prisma client and must be read with raw SQL.
    await dbx().$executeRawUnsafe(`ALTER TABLE "EventLead" ADD COLUMN IF NOT EXISTS "public_token" TEXT`).catch(() => { });
    await dbx().$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "EventLead_public_token_key"
     ON "EventLead"("public_token") WHERE "public_token" IS NOT NULL`).catch(() => { });
    // The customer opening their summary page is a live interest signal, and the
    // manager working the board should see it.
    await dbx().$executeRawUnsafe(`ALTER TABLE "EventLead" ADD COLUMN IF NOT EXISTS "viewed_at" TIMESTAMPTZ`).catch(() => { });
    await dbx().$executeRawUnsafe(`ALTER TABLE "EventLead" ADD COLUMN IF NOT EXISTS "view_count" INTEGER DEFAULT 0`).catch(() => { });
}
// What the customer is told, per pipeline stage. 'lost' deliberately shows the
// in-progress state instead: a manager marking a lead "not relevant" is an
// internal decision, and telling the customer their event was rejected on a
// page they may revisit is not the restaurant's intent.
const CUSTOMER_STAGE = {
    new: 1, pending: 1, cold: 1, warm: 1, qualified: 1,
    contacted: 2,
    quoted: 3,
    won: 4,
    lost: 2,
};
/**
 * The lead's thank-you token, minted once and reused. 32 bytes of urlsafe
 * randomness — the link is the only thing standing between a stranger and
 * someone else's event details, so it has to be unguessable, not sequential.
 */
export async function getOrCreateLeadToken(leadId) {
    if (!leadId)
        return null;
    await ensureLeadToken();
    try {
        const rows = await dbx().$queryRawUnsafe(`SELECT public_token FROM "EventLead" WHERE id = $1`, leadId);
        const existing = rows?.[0]?.public_token;
        if (existing)
            return String(existing);
        const token = randomBytes(24).toString('base64url');
        await dbx().$executeRawUnsafe(`UPDATE "EventLead" SET public_token = $2 WHERE id = $1 AND public_token IS NULL`, leadId, token);
        const after = await dbx().$queryRawUnsafe(`SELECT public_token FROM "EventLead" WHERE id = $1`, leadId);
        return after?.[0]?.public_token ? String(after[0].public_token) : null;
    }
    catch {
        return null;
    }
}
// The extra fields the chat stashes as JSON inside `notes` (event_time,
// location, contact_email...) because adding columns kept breaking on Supabase.
function readMeta(notes) {
    try {
        const raw = String(notes || '');
        const i = raw.indexOf('---META---');
        if (i < 0)
            return {};
        return JSON.parse(raw.slice(i + '---META---'.length).trim()) || {};
    }
    catch {
        return {};
    }
}
// PUBLIC — the summary the customer sees after the bot hands them off.
registerFn('getEventLeadByToken', async ({ body }) => {
    await ensureLeadToken();
    const token = String((body || {}).token || '').trim();
    // A short token means a truncated or hand-typed link, never a real one.
    if (token.length < 20)
        throw new Error('not_found');
    const rows = await dbx().$queryRawUnsafe(`SELECT id, contact_name, contact_phone, event_date, event_type, guest_count,
            budget_per_person, hours_window, notes, created_date, status
     FROM "EventLead" WHERE public_token = $1 LIMIT 1`, token).catch(() => []);
    const l = rows?.[0];
    if (!l)
        throw new Error('not_found');
    const meta = readMeta(l.notes);
    // Record the visit for the manager's board. Never let this fail the page.
    dbx().$executeRawUnsafe(`UPDATE "EventLead"
     SET viewed_at = NOW(), view_count = COALESCE(view_count, 0) + 1
     WHERE id = $1`, l.id).catch(() => { });
    // Deliberately narrow: no conversation_log, no score, no status, no id of
    // anything else. Only what this visitor typed themselves.
    return {
        contact_name: l.contact_name || null,
        contact_phone: l.contact_phone || null,
        contact_email: meta.contact_email || null,
        event_date: l.event_date || null,
        event_time: meta.event_time || null,
        event_type: l.event_type || null,
        guest_count: l.guest_count ?? null,
        budget_per_person: l.budget_per_person ?? null,
        hours_window: l.hours_window || null,
        location: meta.location || null,
        special_requests: meta.special_requests || null,
        created_date: l.created_date || null,
        stage: CUSTOMER_STAGE[String(l.status || 'new')] ?? 1,
    };
}, { public: true });
// ── campaign pixels ────────────────────────────────────────────────────────
// Structured IDs rather than a free-text script box. A snippet field on a page
// served to the public is an XSS vector, and in a multi-tenant product that is
// not a risk worth taking to save pasting an ID into a labelled input.
async function ensurePixelTable() {
    await dbx().$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "MarketingPixelSetting" (
      id TEXT PRIMARY KEY,
      meta_pixel_id TEXT,
      meta_event_name TEXT DEFAULT 'Lead',
      google_ads_id TEXT,
      google_ads_label TEXT,
      ga4_id TEXT,
      enabled BOOLEAN DEFAULT true,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => { });
}
const clean = (v, max = 60) => {
    const s = String(v ?? '').trim().slice(0, max);
    // These are IDs, not markup. Anything outside this set is not an ID and has
    // no business reaching a <script> tag.
    return /^[A-Za-z0-9_\-.\/]*$/.test(s) ? s : '';
};
// PUBLIC — the thank-you page needs these before it can fire anything. Pixel
// IDs are public by nature; they appear in the page source of every site using
// them.
registerFn('getMarketingPixels', async () => {
    await ensurePixelTable();
    const rows = await dbx().$queryRawUnsafe(`SELECT meta_pixel_id, meta_event_name, google_ads_id, google_ads_label, ga4_id, enabled
     FROM "MarketingPixelSetting" ORDER BY updated_at DESC LIMIT 1`).catch(() => []);
    const r = rows?.[0] || {};
    if (r.enabled === false)
        return { enabled: false };
    return {
        enabled: true,
        meta_pixel_id: r.meta_pixel_id || null,
        meta_event_name: r.meta_event_name || 'Lead',
        google_ads_id: r.google_ads_id || null,
        google_ads_label: r.google_ads_label || null,
        ga4_id: r.ga4_id || null,
    };
}, { public: true });
registerFn('setMarketingPixels', async ({ user, body }) => {
    if (!user?.id)
        throw new Error('unauthorized');
    if (!isAdminRole(user?.role))
        throw new Error('admin only');
    await ensurePixelTable();
    const b = (body || {});
    await dbx().$executeRawUnsafe(`DELETE FROM "MarketingPixelSetting"`).catch(() => { });
    await dbx().$executeRawUnsafe(`INSERT INTO "MarketingPixelSetting"
       (id, meta_pixel_id, meta_event_name, google_ads_id, google_ads_label, ga4_id, enabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`, `px_${Date.now().toString(36)}`, clean(b.meta_pixel_id) || null, clean(b.meta_event_name, 40) || 'Lead', clean(b.google_ads_id) || null, clean(b.google_ads_label) || null, clean(b.ga4_id) || null, b.enabled !== false);
    return { ok: true };
});
// PUBLIC — owner-controlled content for the thank-you page.
registerFn('getEventThanksSettings', async () => {
    await ensureThanksSettings();
    const rows = await dbx().$queryRawUnsafe(`SELECT video_url, video_title, response_text
     FROM "EventThanksSetting" ORDER BY updated_at DESC LIMIT 1`).catch(() => []);
    const r = rows?.[0] || {};
    return {
        video_url: r.video_url || null,
        video_title: r.video_title || null,
        response_text: r.response_text || 'נחזור אליך תוך יום עסקים אחד',
    };
}, { public: true });
registerFn('setEventThanksSettings', async ({ user, body }) => {
    if (!user?.id)
        throw new Error('unauthorized');
    if (!isAdminRole(user?.role))
        throw new Error('admin only');
    await ensureThanksSettings();
    const b = (body || {});
    const url = String(b.video_url || '').trim().slice(0, 500);
    // Only our own uploaded files or plain https media — never a javascript: or
    // data: URL, which on a public page would execute in the visitor's browser.
    const safeUrl = !url || /^(https:\/\/|\/api\/files\/)/i.test(url) ? url : '';
    await dbx().$executeRawUnsafe(`DELETE FROM "EventThanksSetting"`).catch(() => { });
    await dbx().$executeRawUnsafe(`INSERT INTO "EventThanksSetting" (id, video_url, video_title, response_text)
     VALUES ($1,$2,$3,$4)`, `ets_${Date.now().toString(36)}`, safeUrl || null, String(b.video_title || '').slice(0, 120) || null, String(b.response_text || '').slice(0, 200) || null);
    return { ok: true, video_url: safeUrl || null };
});
//# sourceMappingURL=eventThanks.js.map