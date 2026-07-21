// notificationSettingsFns.ts
// Owner-facing API for the /NotificationSettings page: read the merged registry,
// override a message (on/off, text, schedule), reset one to default, and preview
// an edited template. Isolated table + raw SQL layer lives in
// lib/notificationSettings.ts; the message catalog lives in
// lib/notificationRegistry.ts.
import { registerFn } from './index.js';
import { listNotifSettings, setNotifSetting, resetNotifSetting, } from '../lib/notificationSettings.js';
import { byKey, applyTokens, AUDIENCE_ORDER, AUDIENCE_LABEL, } from '../lib/notificationRegistry.js';
const isAdminRole = (r) => r === 'owner' || r === 'admin';
// Sample values used to render a live preview in the edit modal.
const SAMPLE = {
    name: 'דנה', first: 'דנה', brand: 'עלינא', link: 'https://topalena.com',
    url: 'https://topalena.com', email: 'name@example.com', password: 'Team-1234',
    count: '3', minutes: '15', title: 'פגישה עם ספק', text: 'להזמין ירקות',
    balance: '4,500', day: '25/07', range: '21.07-27.07', start: '12:00',
    address: 'רוטשילד 104, ראשון לציון',
};
const sampleFor = (key) => {
    const out = {};
    for (const v of byKey(key)?.variables || [])
        out[v.token] = SAMPLE[v.token] ?? `{${v.token}}`;
    return out;
};
// READ — the whole catalog, grouped by audience for the page.
registerFn('getNotificationSettings', async ({ user }) => {
    if (!user?.id)
        throw new Error('unauthorized');
    if (!isAdminRole(user?.role))
        throw new Error('admin only');
    const all = await listNotifSettings();
    const groups = AUDIENCE_ORDER
        .map((aud) => ({
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
registerFn('setNotificationSetting', async ({ user, body }) => {
    if (!user?.id)
        throw new Error('unauthorized');
    if (!isAdminRole(user?.role))
        throw new Error('admin only');
    const b = (body || {});
    const key = String(b.key || '');
    const def = byKey(key);
    if (!def)
        throw new Error('unknown notification');
    const patch = {};
    if (b.enabled !== undefined)
        patch.enabled = !!b.enabled;
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
// RESET — revert one message entirely to its default.
registerFn('resetNotificationSetting', async ({ user, body }) => {
    if (!user?.id)
        throw new Error('unauthorized');
    if (!isAdminRole(user?.role))
        throw new Error('admin only');
    const key = String((body || {}).key || '');
    if (!byKey(key))
        throw new Error('unknown notification');
    await resetNotifSetting(key);
    return { ok: true };
});
// PREVIEW — render a (possibly unsaved) template with sample values.
registerFn('previewNotificationText', async ({ user, body }) => {
    if (!user?.id)
        throw new Error('unauthorized');
    if (!isAdminRole(user?.role))
        throw new Error('admin only');
    const b = (body || {});
    const key = String(b.key || '');
    const def = byKey(key);
    if (!def)
        throw new Error('unknown notification');
    const tpl = b.custom_text != null && String(b.custom_text).trim()
        ? String(b.custom_text)
        : (def.defaultText || '');
    return { preview: applyTokens(tpl, sampleFor(key)) };
});
//# sourceMappingURL=notificationSettingsFns.js.map