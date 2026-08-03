// notificationSettingsFns.ts
// Owner-facing API for the /NotificationSettings page: read the merged registry,
// override a message (on/off, text, schedule), reset one to default, and preview
// an edited template. Isolated table + raw SQL layer lives in
// lib/notificationSettings.ts; the message catalog lives in
// lib/notificationRegistry.ts.
import { registerFn } from './index.js';
import { prisma } from '../db.js';
import {
  listNotifSettings, setNotifSetting, resetNotifSetting,
  type NotifPatch,
} from '../lib/notificationSettings.js';
import {
  byKey, applyTokens, AUDIENCE_ORDER, AUDIENCE_LABEL, type NotifAudience,
} from '../lib/notificationRegistry.js';
import { getNudgeConfig } from '../lib/teamNudges.js';

const isAdminRole = (r: any) => r === 'owner' || r === 'admin';

// Read/write a dotted path (e.g. 'clockin.delay_min') on a plain object.
const getPath = (o: any, path: string): any =>
  path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
const setPath = (o: any, path: string, val: any): void => {
  const keys = path.split('.');
  let cur = o;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = val;
};

// Sample values used to render a live preview in the edit modal.
const SAMPLE: Record<string, string> = {
  name: 'דנה', first: 'דנה', brand: 'עלינא', link: 'https://topalena.com',
  url: 'https://topalena.com', email: 'name@example.com', password: 'Team-1234',
  count: '3', minutes: '15', title: 'פגישה עם ספק', text: 'להזמין ירקות',
  balance: '4,500', day: '25/07', range: '21.07-27.07', start: '12:00',
  address: 'רוטשילד 104, ראשון לציון',
};
const sampleFor = (key: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const v of byKey(key)?.variables || []) out[v.token] = SAMPLE[v.token] ?? `{${v.token}}`;
  return out;
};

// READ — the whole catalog, grouped by audience for the page.
registerFn('getNotificationSettings', async ({ user }: any) => {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdminRole(user?.role)) throw new Error('admin only');
  const all = await listNotifSettings();
  // Attach the live "send after N minutes" value for delay-configurable messages
  // (read from the same team_nudges config the runtime uses — no separate store).
  if (all.some((n) => (n as any).delayConfig)) {
    const nudge = await getNudgeConfig().catch(() => null);
    for (const n of all as any[]) {
      if (n.delayConfig) {
        const v = nudge ? getPath(nudge, n.delayConfig.path) : undefined;
        n.delay_min = Number.isFinite(v) ? v : n.delayConfig.default;
      }
    }
  }
  const groups = AUDIENCE_ORDER
    .map((aud: NotifAudience) => ({
      audience: aud,
      label: AUDIENCE_LABEL[aud],
      items: all.filter((n) => n.audience === aud),
    }))
    .filter((g) => g.items.length > 0);
  return {
    groups,
    total: all.length,
    editable_text: all.filter((n) => n.textEditability === 'full').length,
  };
});

// WRITE — override one message. Body: { key, enabled?, custom_text?, schedule_json? }.
registerFn('setNotificationSetting', async ({ user, body }: any) => {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdminRole(user?.role)) throw new Error('admin only');
  const b = (body || {}) as any;
  const key = String(b.key || '');
  const def = byKey(key);
  if (!def) throw new Error('unknown notification');

  const patch: NotifPatch = {};
  if (b.enabled !== undefined) patch.enabled = !!b.enabled;
  if (b.custom_text !== undefined) {
    // Guard: don't let a 'none'-tier message get a free-text body it won't use.
    if (def.textEditability === 'none' && b.custom_text) {
      throw new Error('this message is not text-editable');
    }
    patch.custom_text = b.custom_text;
  }
  if (b.schedule_json !== undefined) {
    if (def.scheduleShape === 'none' && b.schedule_json) {
      throw new Error('this message has no editable schedule');
    }
    patch.schedule_json = b.schedule_json;
  }

  await setNotifSetting(key, patch, user.id);
  return { ok: true };
});

// SET DELAY — change how many minutes after the trigger a delay-based reminder
// fires. Persists to RestaurantProfile.team_nudges (the exact value the runtime
// reads), so this card and the ops-manager panel stay in sync. Body: { key, delay_min }.
registerFn('setNotificationDelay', async ({ user, body }: any) => {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdminRole(user?.role)) throw new Error('admin only');
  const b = (body || {}) as any;
  const key = String(b.key || '');
  const def = byKey(key) as any;
  if (!def?.delayConfig) throw new Error('this message has no editable delay');
  let val = Math.round(Number(b.delay_min));
  if (!Number.isFinite(val)) throw new Error('invalid delay');
  val = Math.max(def.delayConfig.min, Math.min(def.delayConfig.max, val));

  const cfg: any = await getNudgeConfig();
  setPath(cfg, def.delayConfig.path, val);
  const px = prisma as any;
  await px.$executeRawUnsafe(`ALTER TABLE "RestaurantProfile" ADD COLUMN IF NOT EXISTS "team_nudges" JSONB`).catch(() => {});
  await px.$executeRawUnsafe(`UPDATE "RestaurantProfile" SET team_nudges = $1::jsonb`, JSON.stringify(cfg));
  return { ok: true, delay_min: val };
});

// RESET — revert one message entirely to its default.
registerFn('resetNotificationSetting', async ({ user, body }: any) => {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdminRole(user?.role)) throw new Error('admin only');
  const key = String((body || {}).key || '');
  if (!byKey(key)) throw new Error('unknown notification');
  await resetNotifSetting(key);
  return { ok: true };
});

// PREVIEW — render a (possibly unsaved) template with sample values.
registerFn('previewNotificationText', async ({ user, body }: any) => {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdminRole(user?.role)) throw new Error('admin only');
  const b = (body || {}) as any;
  const key = String(b.key || '');
  const def = byKey(key);
  if (!def) throw new Error('unknown notification');
  const tpl = b.custom_text != null && String(b.custom_text).trim()
    ? String(b.custom_text)
    : (def.defaultText || '');
  return { preview: applyTokens(tpl, sampleFor(key)) };
});
