// Auto-Tracker client logger — batches user activity events and flushes them
// every 30s + on pagehide. Used by Layout's route-change effect + voice
// command dispatcher + any component that opts in with a `data-track="…"`
// attribute. The server cron at 23:00 IL scans the resulting ActivityLog
// for patterns and asks Gemini to propose voice shortcuts.
import { base44 } from '@/api/base44Client';

let queue = [];
let flushTimer = null;
const FLUSH_INTERVAL_MS = 30_000;
const MAX_QUEUE_SIZE = 100;

export function logActivity(event) {
    if (typeof window === 'undefined') return;
    if (!event || !event.action_type) return;
    queue.push({
        action_type: String(event.action_type),
        page: event.page || (typeof location !== 'undefined' ? location.pathname : ''),
        label: event.label || '',
        target_id: event.target_id || '',
        metadata: event.metadata || null,
    });
    if (queue.length >= MAX_QUEUE_SIZE) {
        void flush();
    } else if (!flushTimer) {
        flushTimer = setTimeout(() => { void flush(); }, FLUSH_INTERVAL_MS);
    }
}

async function flush() {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (queue.length === 0) return;
    const batch = queue.splice(0, queue.length);
    try {
        await base44.functions.logActivity({ events: batch });
    } catch (e) {
        // Don't restore — auto-tracker is best-effort, dropping logs is OK.
        console.warn('[activityLogger] flush failed:', e?.message);
    }
}

// Make sure we flush on tab close so short-session activity isn't lost.
if (typeof window !== 'undefined' && !window.__activityLoggerWired) {
    window.__activityLoggerWired = true;
    window.addEventListener('pagehide', () => { void flush(); });
    window.addEventListener('voice:data-changed', (e) => {
        const detail = e?.detail || {};
        logActivity({
            action_type: 'voice',
            label: detail.scope || 'voice_action',
            metadata: detail,
        });
    });
    // Generic opt-in click tracking: any element with data-track="some-label"
    // gets logged when clicked. Cheap, opt-in, no event-storm risk.
    window.addEventListener('click', (ev) => {
        try {
            const el = ev.target?.closest?.('[data-track]');
            if (!el) return;
            logActivity({
                action_type: 'click',
                label: el.getAttribute('data-track') || '',
                target_id: el.getAttribute('data-track-id') || '',
            });
        } catch { /* swallow */ }
    }, { capture: true });
}
