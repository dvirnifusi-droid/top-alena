// Business context — a single rich-prose block that every AI prompt should
// prepend as system context so its output matches the actual tenant's
// business (Miha is a wine bar, Alena is a Josper burger-bar, Yoavi is a
// tapas joint). Reads all populated fields from RestaurantProfile + the
// cached ai-composed business_context if present.
import { prisma } from '../db.js';
import { getBrandName } from './brandName.js';
let _cache = null;
const TTL_MS = 30_000;
export async function getBusinessContext() {
    const now = Date.now();
    if (_cache && now - _cache.at < TTL_MS)
        return _cache.text;
    const brand = await getBrandName();
    let profile = null;
    try {
        profile = await prisma.restaurantProfile.findFirst({});
    }
    catch { /* no profile — return brand-only */ }
    const lines = [];
    lines.push(`שם המסעדה: ${brand}`);
    // If the owner (or AI interviewer) composed a canonical business_context
    // prose block, prefer it — it's already tuned and coherent.
    if (profile?.business_context && String(profile.business_context).trim()) {
        _cache = { text: String(profile.business_context).trim(), at: now };
        return _cache.text;
    }
    if (profile?.business_type)
        lines.push(`סוג עסק: ${profile.business_type}`);
    if (profile?.cuisine_style)
        lines.push(`סגנון מטבח: ${profile.cuisine_style}`);
    if (profile?.city || profile?.address) {
        const loc = [profile.address, profile.city].filter(Boolean).join(', ');
        lines.push(`מיקום: ${loc}`);
    }
    if (profile?.phone)
        lines.push(`טלפון: ${profile.phone}`);
    if (profile?.target_audience)
        lines.push(`קהל יעד: ${profile.target_audience}`);
    if (profile?.description)
        lines.push(`תיאור: ${profile.description}`);
    if (profile?.menu_description)
        lines.push(`תפריט: ${profile.menu_description}`);
    const usp = profile?.unique_selling_points;
    if (Array.isArray(usp) && usp.length) {
        lines.push(`יתרונות ייחודיים: ${usp.join(', ')}`);
    }
    else if (typeof usp === 'string' && usp.trim()) {
        lines.push(`יתרונות ייחודיים: ${usp}`);
    }
    const oh = profile?.opening_hours;
    if (oh && typeof oh === 'object') {
        const days = { sun: 'א', mon: 'ב', tue: 'ג', wed: 'ד', thu: 'ה', fri: 'ו', sat: 'ש' };
        const parts = [];
        for (const [k, v] of Object.entries(oh)) {
            const label = days[k] || k;
            if (v?.open && v?.close)
                parts.push(`${label} ${v.open}-${v.close}`);
            else if (v?.closed)
                parts.push(`${label} סגור`);
        }
        if (parts.length)
            lines.push(`שעות פעילות: ${parts.join(', ')}`);
    }
    if (profile?.primary_goals)
        lines.push(`מטרות עסקיות: ${profile.primary_goals}`);
    if (profile?.current_challenges)
        lines.push(`אתגרים נוכחיים: ${profile.current_challenges}`);
    if (profile?.brand_persona)
        lines.push(`טון מותג: ${profile.brand_persona}`);
    const text = lines.join('\n');
    _cache = { text, at: now };
    return text;
}
/**
 * Build a system-prompt prefix that every AI-agent call should include so
 * the output speaks in the voice of the tenant's actual business. Wrap in
 * markdown so it's visually distinct from the task itself.
 */
export async function businessContextBlock() {
    const ctx = await getBusinessContext();
    if (!ctx)
        return '';
    return `--- פרופיל העסק (בשביל שהתשובה שלך תדבר בשם ${(await getBrandName())}) ---\n${ctx}\n--- סוף פרופיל ---\n\n`;
}
export function invalidateBusinessContextCache() {
    _cache = null;
}
//# sourceMappingURL=businessContext.js.map