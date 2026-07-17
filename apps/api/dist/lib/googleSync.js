// Google Calendar + Tasks sync for the WhatsApp personal assistant.
//
// OAuth flow:
//   1. Admin sends 'חבר גוגל' / 'connect google' in WhatsApp.
//   2. Bot replies with a /api/google/connect?phone=X URL.
//   3. User clicks → Google consent → /api/google/callback → tokens stored.
//   4. Subsequent event_add / task_add executors mirror to Google.
//
// Storage: per-phone tokens live on a WhatsAppMessage row with
// status='google_oauth_tokens'. The row's raw JSON holds refresh_token,
// access_token, access_token_exp (epoch ms), email, and the calendar id
// to write into (default 'primary'). No schema migration needed.
import { prisma } from '../db.js';
import { getBrandName } from './brandName.js';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://topalena.com';
const REDIRECT_URI = `${PUBLIC_BASE_URL}/api/google/callback`;
const SCOPES = [
    'openid',
    'email',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/tasks',
];
// ─── OAuth flow ────────────────────────────────────────────────────────────
export function buildConsentUrl(statePhone) {
    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: SCOPES.join(' '),
        access_type: 'offline', // get a refresh_token
        prompt: 'consent', // force fresh refresh_token even if already authorized
        state: statePhone,
        include_granted_scopes: 'true',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
export async function exchangeCodeForTokens(code) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code',
        }).toString(),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`token_exchange_${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
}
async function refreshAccessToken(refreshToken) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            grant_type: 'refresh_token',
        }).toString(),
    });
    if (!res.ok)
        throw new Error(`refresh_${res.status}`);
    return res.json();
}
// ─── Token persistence (one row per phone, latest wins) ────────────────────
export async function saveGoogleTokens(phone, payload) {
    const expAt = Date.now() + (payload.expires_in - 60) * 1000;
    // Look up the existing tokens row (so we keep the refresh_token if Google
    // didn't return a new one on this refresh).
    const existing = await loadGoogleTokenRow(phone);
    const refresh = payload.refresh_token || existing?.raw?.refresh_token;
    if (existing) {
        await prisma.whatsAppMessage.update({
            where: { id: existing.id },
            data: {
                raw: {
                    access_token: payload.access_token,
                    refresh_token: refresh,
                    access_token_exp: expAt,
                    email: payload.email || existing.raw?.email,
                    calendar_id: existing.raw?.calendar_id || 'primary',
                    tasks_list_id: existing.raw?.tasks_list_id || '@default',
                },
                body: `[google-sync] ${payload.email || phone}`,
            },
        });
    }
    else {
        await prisma.whatsAppMessage.create({
            data: {
                twilio_sid: null, direction: 'outbound',
                from_phone: 'whatsapp:+system', to_phone: phone, contact_phone: phone,
                body: `[google-sync] ${payload.email || phone}`,
                num_media: 0,
                status: 'google_oauth_tokens',
                raw: {
                    access_token: payload.access_token,
                    refresh_token: refresh,
                    access_token_exp: expAt,
                    email: payload.email,
                    calendar_id: 'primary',
                    tasks_list_id: '@default',
                },
                is_read: false,
            },
        });
    }
}
async function loadGoogleTokenRow(phone) {
    return prisma.whatsAppMessage.findFirst({
        where: { status: 'google_oauth_tokens', contact_phone: phone },
        orderBy: { id: 'desc' },
    }).catch(() => null);
}
export async function isGoogleConnected(phone) {
    const row = await loadGoogleTokenRow(phone);
    return !!(row && row.raw?.refresh_token);
}
// Return a usable access_token; refresh if needed. Returns null if not connected.
async function getValidAccessToken(phone) {
    const row = await loadGoogleTokenRow(phone);
    if (!row)
        return null;
    const raw = row.raw;
    if (!raw?.refresh_token)
        return null;
    if (raw.access_token && raw.access_token_exp && raw.access_token_exp > Date.now()) {
        return raw.access_token;
    }
    // Refresh
    try {
        const refreshed = await refreshAccessToken(raw.refresh_token);
        await saveGoogleTokens(phone, {
            access_token: refreshed.access_token,
            refresh_token: raw.refresh_token,
            expires_in: refreshed.expires_in,
            email: raw.email,
        });
        return refreshed.access_token;
    }
    catch (e) {
        console.warn('[google-sync] refresh failed', { phone, err: e?.message });
        return null;
    }
}
// ─── Calendar (events) ────────────────────────────────────────────────────
export async function createCalendarEvent(phone, params) {
    const token = await getValidAccessToken(phone);
    if (!token)
        return { ok: false, error: 'not_connected' };
    const row = await loadGoogleTokenRow(phone);
    const calendarId = row?.raw?.calendar_id || 'primary';
    const start = new Date(params.whenIso);
    const end = new Date(start.getTime() + (params.durationMin || 60) * 60_000);
    const brand = await getBrandName();
    const body = {
        summary: params.title,
        description: params.description || `נוצר על-ידי העוזר של ${brand} ב-WhatsApp`,
        start: { dateTime: start.toISOString(), timeZone: 'Asia/Jerusalem' },
        end: { dateTime: end.toISOString(), timeZone: 'Asia/Jerusalem' },
        reminders: { useDefault: true },
    };
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `calendar_${res.status}: ${text.slice(0, 120)}` };
    }
    const data = await res.json();
    return { ok: true, id: data.id, htmlLink: data.htmlLink };
}
// ─── Tasks ────────────────────────────────────────────────────────────────
export async function createTasksItem(phone, params) {
    const token = await getValidAccessToken(phone);
    if (!token)
        return { ok: false, error: 'not_connected' };
    const row = await loadGoogleTokenRow(phone);
    const tasksListId = row?.raw?.tasks_list_id || '@default';
    const body = { title: params.title, notes: params.notes };
    if (params.due)
        body.due = new Date(params.due).toISOString();
    const res = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(tasksListId)}/tasks`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `tasks_${res.status}: ${text.slice(0, 120)}` };
    }
    const data = await res.json();
    return { ok: true, id: data.id, webViewLink: data.webViewLink };
}
export async function completeTasksItem(phone, taskGoogleId) {
    const token = await getValidAccessToken(phone);
    if (!token)
        return false;
    const row = await loadGoogleTokenRow(phone);
    const tasksListId = row?.raw?.tasks_list_id || '@default';
    const res = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(tasksListId)}/tasks/${taskGoogleId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
    });
    return res.ok;
}
// ─── Pull (poll calendar every N min for externally-added events) ─────────
export async function pullCalendarEvents(phone, daysAhead = 30) {
    const token = await getValidAccessToken(phone);
    if (!token)
        return { ok: false, imported: 0, updated: 0, skipped: 0, error: 'not_connected' };
    const row = await loadGoogleTokenRow(phone);
    const calendarId = row?.raw?.calendar_id || 'primary';
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + daysAhead * 86_400_000).toISOString();
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=250`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok)
        return { ok: false, imported: 0, updated: 0, skipped: 0, error: `pull_${res.status}` };
    const data = await res.json();
    const items = data.items || [];
    let imported = 0, updated = 0, skipped = 0;
    for (const ev of items) {
        if (!ev.start?.dateTime) {
            skipped++;
            continue;
        } // all-day events for now skipped
        const gId = ev.id;
        // Check if we already have this event (raw.google_event_id matches). Match
        // across ALL event statuses — including already-fired ('event_done') rows —
        // so a fired event isn't re-imported as a fresh scheduled_event. Prisma
        // can't cheaply filter a JSON field, so pull a batch and filter in memory.
        const recent = await prisma.whatsAppMessage.findMany({
            where: { status: { in: ['scheduled_event', 'event_done'] }, contact_phone: phone },
            take: 500,
        });
        const match = recent.find((r) => r.raw?.google_event_id === gId);
        if (match) {
            // Update if changed
            const newAt = new Date(ev.start.dateTime).toISOString();
            const oldAt = match.raw?.event_at;
            const newTitle = ev.summary || '(ללא כותרת)';
            const oldTitle = match.raw?.title;
            if (newAt !== oldAt || newTitle !== oldTitle) {
                await prisma.whatsAppMessage.update({
                    where: { id: match.id },
                    data: {
                        raw: { ...match.raw, event_at: newAt, title: newTitle, notified_lead: false, notified_start: false },
                    },
                });
                updated++;
            }
            else
                skipped++;
        }
        else {
            // Import as new scheduled_event
            await prisma.whatsAppMessage.create({
                data: {
                    twilio_sid: null, direction: 'outbound',
                    from_phone: 'whatsapp:+system', to_phone: phone, contact_phone: phone,
                    body: `🗓 ${ev.summary || '(ללא כותרת)'} · ${new Date(ev.start.dateTime).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' })}`,
                    num_media: 0,
                    status: 'scheduled_event',
                    raw: {
                        event_at: new Date(ev.start.dateTime).toISOString(),
                        title: ev.summary || '(ללא כותרת)',
                        lead_min: 15,
                        target_phone: phone,
                        google_event_id: gId,
                        source: 'google_calendar',
                        notified_lead: false, notified_start: false,
                    },
                    is_read: false,
                },
            });
            imported++;
        }
    }
    return { ok: true, imported, updated, skipped };
}
// Pull for every connected admin (called by cron every 15 min).
export async function pullAllConnectedCalendars() {
    const tokens = await prisma.whatsAppMessage.findMany({
        where: { status: 'google_oauth_tokens' },
        take: 50,
    });
    const out = [];
    for (const t of tokens) {
        const r = await pullCalendarEvents(t.contact_phone, 30).catch((e) => ({ ok: false, error: e?.message }));
        out.push({ phone: t.contact_phone, result: r });
    }
    return out;
}
//# sourceMappingURL=googleSync.js.map