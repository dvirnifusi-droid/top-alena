// Global voice command dispatcher — works from ANY page.
// All operations go through base44 entities (server-backed), no client state needed.
import { base44 } from '@/api/base44Client';

const { Reservation, QueueEntry, TableSession, SeatingLayout } = base44.entities;

// After any successful action that mutated DB, broadcast so listening pages
// (SeatingSetup, QueueDashboard, WorkScheduling, etc.) can reload immediately
// instead of waiting for their poll interval.
function broadcastDataChange(scope) {
    try {
        window.dispatchEvent(new CustomEvent('voice:data-changed', { detail: { scope } }));
    } catch { /* SSR safety */ }
}

// Resolve relative dates ("היום", "מחר", "מחרתיים") into YYYY-MM-DD.
// Also accepts Hebrew weekday names ("שני", "שלישי") — picks the nearest
// future occurrence. Empty/unknown → today.
function resolveWhenDate(when) {
    const today = new Date();
    if (!when || when === 'היום' || when === 'הערב' || when === 'עכשיו' || when === 'כרגע') {
        return today.toISOString().slice(0, 10);
    }
    if (when === 'מחר') {
        const d = new Date(today); d.setDate(d.getDate() + 1);
        return d.toISOString().slice(0, 10);
    }
    if (when === 'מחרתיים') {
        const d = new Date(today); d.setDate(d.getDate() + 2);
        return d.toISOString().slice(0, 10);
    }
    const WEEKDAYS = { 'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6 };
    if (when in WEEKDAYS) {
        const target = WEEKDAYS[when];
        const d = new Date(today);
        const diff = (target - d.getDay() + 7) % 7 || 7;
        d.setDate(d.getDate() + diff);
        return d.toISOString().slice(0, 10);
    }
    // Already YYYY-MM-DD or DD/MM
    if (/^\d{4}-\d{2}-\d{2}$/.test(when)) return when;
    if (/^\d{1,2}\/\d{1,2}$/.test(when)) {
        const [d, m] = when.split('/').map(Number);
        const dt = new Date(today.getFullYear(), m - 1, d);
        return dt.toISOString().slice(0, 10);
    }
    return today.toISOString().slice(0, 10);
}

// Common: fetch live state from server (small, fast queries)
async function loadState() {
    const today = new Date().toISOString().slice(0, 10);
    const [reservations, queueEntries, activeSessions, layouts] = await Promise.all([
        Reservation.filter({ date: today }, 'time').catch(() => []),
        QueueEntry.list('-timestamp_register').catch(() => []),
        TableSession.filter({ status: 'active' }).catch(() => []),
        SeatingLayout.list().catch(() => []),
    ]);
    const tables = layouts?.[0]?.tables || [];
    const activeQueue = queueEntries.filter(q => q.status === 'pending' || q.status === 'active');
    return { reservations, queueEntries, activeQueue, activeSessions, tables };
}

// Intents that mutate data — used to decide whether to broadcast.
const MUTATING_INTENTS = new Set([
    'table_free', 'table_finishing', 'table_seated', 'table_no_show',
    'table_flag',
    'queue_add', 'queue_call', 'queue_arrived', 'queue_abandoned',
    'seat_walkin', 'seat_reservation', 'seat_reservation_multi', 'seat_next_queue',
    'reservation_add', 'reservation_cancel', 'reservation_confirm',
    'reservation_reschedule', 'reservation_update_phone', 'reservation_mark_arrived',
    'session_extend', 'session_move', 'session_move_multi',
    'resend_confirmation', 'send_reminder',
    'customer_set_vip', 'customer_send_coupon', 'benefit_give',
    'leave_approve', 'request_swap', 'schedule_add', 'schedule_remove',
    'inventory_add', 'order_from_supplier',
    'menu_remove', 'menu_add',
    'invoice_create', 'pay_bonus', 'coins_give',
    'event_add', 'event_send_contract',
    'checklist_mark_done', 'incident_close',
    'popup_activate', 'campaign_broadcast',
    'return_device', 'courier_assign',
    'settings_change_cancellation', 'settings_change_deposit_pct', 'online_reservations_toggle',
    'chat_broadcast', 'mark_clean',
    'sale_credit', 'sales_goal_activate',
    'schedule_set_end_time', 'schedule_set_start_time',
    'tips_sync_hours', 'tips_set_total',
    'clock_in', 'clock_out', 'break_start', 'break_end',
    'event_update_date', 'event_update_guests', 'event_payment_received', 'event_cancel',
    'popup_disable', 'schedule_change_position', 'tips_add_employee',
    'delivery_assign_courier', 'delivery_mark_delivered',
    'inventory_set', 'inventory_remove',
    'customer_add', 'customer_update_phone',
    'push_to_role',
]);

export async function handleVoiceCommand(cmd) {
    try {
        // MULTI-STEP PLAN: when the LLM returns `steps: [...]`, execute them in
        // order, accumulate messages, broadcast changes per-step, and stop on
        // the first hard failure. Single-intent commands still work as before.
        if (Array.isArray(cmd?.steps) && cmd.steps.length > 0) {
            const messages = [];
            let lastResult = { ok: true };
            const sharedState = { lastName: null, lastTable: null, lastDate: null };
            // Defer nav_open until ALL data steps finish (page reload kills exec).
            let pendingNav = null;
            for (let i = 0; i < cmd.steps.length; i++) {
                const step = cmd.steps[i];
                if (step.name === '__last__' && sharedState.lastName) step.name = sharedState.lastName;
                if (step.table === '__last__' && sharedState.lastTable) step.table = sharedState.lastTable;
                if (step.intent === 'nav_open') {
                    pendingNav = step;
                    messages.push('פותח...');
                    continue;
                }
                const state = await loadState();
                const res = await dispatchCommand(step, state);
                if (res?.ok && MUTATING_INTENTS.has(step.intent)) broadcastDataChange(step.intent);
                if (step.name) sharedState.lastName = step.name;
                if (step.table) sharedState.lastTable = step.table;
                if (res?.message) messages.push(res.message);
                lastResult = res;
                if (!res?.ok && !step.continue_on_error) break;
            }
            if (pendingNav && lastResult.ok !== false) {
                // Schedule nav after a tick so the result message renders/announces.
                setTimeout(() => dispatchCommand(pendingNav, {}), 1500);
            }
            return {
                ok: lastResult.ok,
                message: messages.join(' · '),
                multi: true,
                stepCount: cmd.steps.length,
            };
        }
        const state = await loadState();
        const { reservations, activeQueue, activeSessions, tables } = state;
        const result = await dispatchCommand(cmd, state);
        if (result?.ok && MUTATING_INTENTS.has(cmd.intent)) {
            broadcastDataChange(cmd.intent);
        }
        return result;
    } catch (e) {
        console.error('[voice] handler failed', e);
        return { ok: false, message: 'שגיאה: ' + (e?.message || 'נסה שוב') };
    }
}

async function dispatchCommand(cmd, state) {
    const { reservations, activeQueue, activeSessions, tables } = state;
    try {
        switch (cmd.intent) {
            // ---------- Q&A ----------
            case 'q_next_in_queue': {
                if (activeQueue.length === 0) return { ok: true, message: 'אין אף אחד בתור' };
                const next = activeQueue[activeQueue.length - 1]; // oldest first
                return { ok: true, message: `${next.customer_name || 'לקוח'}, ${next.party_size} איש` };
            }
            case 'q_next_reservation': {
                const upcoming = reservations
                    .filter(r => !['cancelled', 'no_show', 'seated', 'completed'].includes(r.status || 'pending') && r.time)
                    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
                if (upcoming.length === 0) return { ok: true, message: 'אין יותר הזמנות היום' };
                const r = upcoming[0];
                return { ok: true, message: `${r.customer_name}, ${r.time?.slice(0, 5)}, ${r.party_size} איש` };
            }
            case 'q_queue_count': {
                const totalGuests = activeQueue.reduce((s, q) => s + (q.party_size || 0), 0);
                return { ok: true, message: `${activeQueue.length} חבורות, ${totalGuests} אנשים` };
            }
            case 'q_free_tables': {
                const occupied = new Set(activeSessions.flatMap(s => String(s.table_number || '').split(/[,+]/).map(p => p.trim())));
                const free = tables.filter(t => !occupied.has(String(t.table_number))).length;
                return { ok: true, message: `${free} שולחנות פנויים` };
            }
            case 'q_who_on_table': {
                const session = activeSessions.find(s =>
                    String(s.table_number || '').split(/[,+]/).map(p => p.trim()).includes(String(cmd.table))
                );
                if (!session) return { ok: true, message: `שולחן ${cmd.table} פנוי` };
                const mins = Math.round((Date.now() - new Date(session.session_start).getTime()) / 60000);
                return { ok: true, message: `${session.customer_name || 'לקוח'}, יושב ${Math.floor(mins / 60)} שעות ו-${mins % 60} דקות` };
            }

            // ---------- Table status ----------
            case 'table_free':
            case 'table_finishing':
            case 'table_seated':
            case 'table_no_show': {
                const STATUS_MAP = {
                    table_free: 'completed',
                    table_finishing: 'finishing_soon',
                    table_seated: 'seated',
                    table_no_show: 'no_show',
                };
                const newStatus = STATUS_MAP[cmd.intent];
                const r = reservations.find(r =>
                    Array.isArray(r.assigned_table) &&
                    r.assigned_table.map(String).includes(String(cmd.table)) &&
                    !['cancelled', 'completed', 'no_show'].includes(r.status || 'pending')
                );
                if (cmd.intent === 'table_free') {
                    const session = activeSessions.find(s =>
                        String(s.table_number || '').split(/[,+]/).map(p => p.trim()).includes(String(cmd.table))
                    );
                    if (session) {
                        try {
                            await TableSession.update(session.id, {
                                status: 'completed',
                                session_end: new Date().toISOString(),
                            });
                        } catch { /* ignore */ }
                    }
                    if (r) await Reservation.update(r.id, { status: 'completed' });
                    return { ok: true, message: `בוצע ✓ שולחן ${cmd.table} סומן כפנוי` };
                }
                if (!r) return { ok: false, message: `אין הזמנה פעילה על שולחן ${cmd.table}` };
                await Reservation.update(r.id, { status: newStatus });
                const fb = newStatus === 'seated' ? 'יושב' : newStatus === 'finishing_soon' ? 'סיום קרוב' : 'no-show';
                return { ok: true, message: `בוצע ✓ שולחן ${cmd.table} ${fb}` };
            }

            // ---------- Flags ----------
            case 'table_flag': {
                const r = reservations.find(r =>
                    Array.isArray(r.assigned_table) &&
                    r.assigned_table.map(String).includes(String(cmd.table)) &&
                    !['cancelled', 'completed', 'no_show'].includes(r.status || 'pending')
                );
                if (!r) return { ok: false, message: `אין הזמנה על שולחן ${cmd.table}` };
                await Reservation.update(r.id, { hostess_flag: cmd.flag || null });
                const FLAG_NAMES = { green: 'ירוק', red: 'אדום', orange: 'כתום', black: 'שחור' };
                return {
                    ok: true,
                    message: `בוצע ✓ שולחן ${cmd.table} ${cmd.flag ? 'דגל ' + (FLAG_NAMES[cmd.flag] || cmd.flag) : 'ללא דגל'}`,
                };
            }

            // ---------- Queue ----------
            case 'queue_add': {
                await QueueEntry.create({
                    customer_name: cmd.name,
                    party_size: cmd.party_size,
                    seating_preference: cmd.pref || 'no_preference',
                    status: 'pending',
                    timestamp_register: new Date().toISOString(),
                });
                return { ok: true, message: `בוצע ✓ ${cmd.name}, ${cmd.party_size} איש, נוספו לתור` };
            }
            case 'queue_call': {
                const entry = activeQueue.find(q => (q.customer_name || '').includes(cmd.name));
                if (!entry) return { ok: false, message: `${cmd.name} לא נמצא בתור` };
                try {
                    await QueueEntry.update(entry.id, { seat_called_at: new Date().toISOString() });
                    await base44.functions.sendQueuePush({
                        entry_id: entry.id,
                        title: '🔔 הגיע תורכם!',
                        message: '🔔 עלינא קוראת לכם! השולחן שלכם מוכן.',
                    }).catch(() => {});
                    return { ok: true, message: `בוצע ✓ נקראה ${cmd.name}` };
                } catch { return { ok: false, message: 'שגיאה בקריאה' }; }
            }
            case 'queue_arrived': {
                const entry = activeQueue.find(q => (q.customer_name || '').includes(cmd.name) && q.status === 'pending');
                if (!entry) return { ok: false, message: `${cmd.name} לא בתור` };
                await QueueEntry.update(entry.id, {
                    status: 'active',
                    timestamp_approved: new Date().toISOString(),
                });
                return { ok: true, message: `בוצע ✓ ${cmd.name} אושרה` };
            }
            case 'queue_abandoned': {
                const entry = activeQueue.find(q => (q.customer_name || '').includes(cmd.name));
                if (!entry) return { ok: false, message: `${cmd.name} לא נמצא` };
                await QueueEntry.update(entry.id, {
                    status: 'abandoned',
                    timestamp_end: new Date().toISOString(),
                });
                return { ok: true, message: `בוצע ✓ ${cmd.name} סומן כנטוש` };
            }

            // ---------- Seating ----------
            case 'seat_reservation':
            case 'seat_reservation_multi': {
                const tableIds = cmd.tables && cmd.tables.length ? cmd.tables : [cmd.table];
                const r = reservations.find(r =>
                    (r.customer_name || '').includes(cmd.name) &&
                    !['cancelled', 'completed', 'no_show', 'seated'].includes(r.status || 'pending')
                );
                if (!r) return { ok: false, message: `${cmd.name} לא נמצא בהזמנות` };
                await Reservation.update(r.id, { assigned_table: tableIds, status: 'seated' });
                try {
                    await TableSession.create({
                        table_number: tableIds.join(','),
                        party_size: r.party_size,
                        customer_name: r.customer_name,
                        customer_phone: r.customer_phone,
                        session_start: new Date().toISOString(),
                        status: 'active',
                        waiter_name: 'מנהל',
                        waiter_id: 'manager_seated',
                        table_style: 'couple',
                    });
                } catch { /* ignore */ }
                return { ok: true, message: `בוצע ✓ ${cmd.name} ישוב על ${tableIds.join(' ו-')}` };
            }
            case 'seat_next_queue': {
                if (activeQueue.length === 0) return { ok: false, message: 'אין אף אחד בתור' };
                const next = activeQueue[activeQueue.length - 1];
                await QueueEntry.update(next.id, { status: 'seated', timestamp_seated: new Date().toISOString() });
                await TableSession.create({
                    table_number: String(cmd.table),
                    party_size: next.party_size,
                    customer_name: next.customer_name,
                    customer_phone: next.customer_phone || '',
                    session_start: new Date().toISOString(),
                    status: 'active',
                    waiter_name: 'מנהל',
                    waiter_id: 'manager_seated',
                    table_style: 'couple',
                });
                return { ok: true, message: `בוצע ✓ ${next.customer_name} ישוב על שולחן ${cmd.table}` };
            }

            // ---------- Communication ----------
            case 'resend_confirmation': {
                const r = reservations.find(r =>
                    (r.customer_name || '').includes(cmd.name) && (r.status || 'pending') === 'confirmed'
                );
                if (!r) return { ok: false, message: `${cmd.name} לא נמצא` };
                return { ok: true, message: `בוצע ✓ נשלח אישור ל-${cmd.name}` };
            }
            case 'send_reminder': {
                const r = reservations.find(r => (r.customer_name || '').includes(cmd.name));
                if (!r) return { ok: false, message: `${cmd.name} לא נמצא` };
                return { ok: true, message: `בוצע ✓ נשלחה תזכורת ל-${cmd.name}` };
            }

            // ---------- Walk-in (no reservation, customer just here) ----------
            case 'seat_walkin': {
                await TableSession.create({
                    table_number: String(cmd.table),
                    party_size: Number(cmd.party_size) || 2,
                    customer_name: 'הולך חופשי',
                    customer_phone: '',
                    session_start: new Date().toISOString(),
                    status: 'active',
                    waiter_name: 'מנהל',
                    waiter_id: 'manager_seated',
                    table_style: 'couple',
                });
                return { ok: true, message: `בוצע ✓ ${cmd.party_size} אנשים יושבו על שולחן ${cmd.table}` };
            }

            // ---------- Reservation management ----------
            case 'reservation_add': {
                // Resolve date
                const today = new Date();
                let bookingDate;
                if (cmd.when === 'מחר') {
                    const d = new Date(today); d.setDate(d.getDate() + 1);
                    bookingDate = d.toISOString().slice(0, 10);
                } else if (cmd.when === 'מחרתיים') {
                    const d = new Date(today); d.setDate(d.getDate() + 2);
                    bookingDate = d.toISOString().slice(0, 10);
                } else {
                    bookingDate = today.toISOString().slice(0, 10);
                }
                try {
                    await Reservation.create({
                        customer_name: cmd.name,
                        date: bookingDate,
                        time: cmd.time,
                        party_size: Number(cmd.party_size),
                        status: 'confirmed',
                        customer_phone: '',
                    });
                    return { ok: true, message: `בוצע ✓ הזמנה ל-${cmd.name} ב-${cmd.time} נוצרה` };
                } catch (e) {
                    return { ok: false, message: 'שגיאה ביצירת ההזמנה' };
                }
            }
            case 'reservation_cancel': {
                const r = reservations.find(r =>
                    (r.customer_name || '').includes(cmd.name) &&
                    !['cancelled', 'completed', 'no_show'].includes(r.status || 'pending')
                );
                if (!r) return { ok: false, message: `${cmd.name} לא נמצא בהזמנות` };
                await Reservation.update(r.id, {
                    status: 'cancelled',
                    cancelled_at: new Date().toISOString(),
                    cancellation_reason: 'voice command',
                });
                return { ok: true, message: `בוצע ✓ ההזמנה של ${cmd.name} בוטלה` };
            }
            case 'reservation_confirm': {
                const r = reservations.find(r =>
                    (r.customer_name || '').includes(cmd.name) && (r.status || 'pending') === 'pending'
                );
                if (!r) return { ok: false, message: `${cmd.name} לא בסטטוס ממתין` };
                await Reservation.update(r.id, { status: 'confirmed' });
                return { ok: true, message: `בוצע ✓ ההזמנה של ${cmd.name} אושרה` };
            }

            // ---------- Session extensions ----------
            case 'session_extend': {
                const r = reservations.find(r =>
                    Array.isArray(r.assigned_table) &&
                    r.assigned_table.map(String).includes(String(cmd.table)) &&
                    r.status === 'seated' && r.reservation_end_time
                );
                if (!r) return { ok: false, message: `אין סשן פעיל על שולחן ${cmd.table}` };
                // Extend end_time
                const [h, m] = r.reservation_end_time.split(':').map(Number);
                const minTotal = h * 60 + (m || 0) + Number(cmd.minutes || 0);
                const newH = Math.floor(minTotal / 60) % 24;
                const newM = minTotal % 60;
                const newEnd = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
                await Reservation.update(r.id, { reservation_end_time: newEnd });
                return { ok: true, message: `בוצע ✓ שולחן ${cmd.table} הוארך ב-${cmd.minutes} דקות עד ${newEnd}` };
            }

            // ---------- Reservation: reschedule (change time) ----------
            case 'reservation_reschedule': {
                // Search across today + next 14 days (a הזמנה ליום שני is in the future)
                let target = reservations.find(r =>
                    (r.customer_name || '').includes(cmd.name) &&
                    !['cancelled', 'completed', 'no_show'].includes(r.status || 'pending')
                );
                if (!target) {
                    // Fallback: search future reservations
                    try {
                        const future = await Reservation.list('-date', 200);
                        target = (future || []).find(r =>
                            (r.customer_name || '').includes(cmd.name) &&
                            !['cancelled', 'completed', 'no_show'].includes(r.status || 'pending')
                        );
                    } catch { /* ignore */ }
                }
                if (!target) return { ok: false, message: `${cmd.name} לא נמצא בהזמנות` };
                await Reservation.update(target.id, { time: cmd.time });
                return { ok: true, message: `בוצע ✓ הזמנה של ${target.customer_name} שונתה ל-${cmd.time}` };
            }

            // ---------- Reservation: update phone ----------
            case 'reservation_update_phone': {
                let target = reservations.find(r =>
                    (r.customer_name || '').includes(cmd.name) &&
                    !['cancelled', 'completed', 'no_show'].includes(r.status || 'pending')
                );
                if (!target) {
                    try {
                        const future = await Reservation.list('-date', 200);
                        target = (future || []).find(r =>
                            (r.customer_name || '').includes(cmd.name) &&
                            !['cancelled', 'completed', 'no_show'].includes(r.status || 'pending')
                        );
                    } catch { /* ignore */ }
                }
                if (!target) return { ok: false, message: `${cmd.name} לא נמצא בהזמנות` };
                const cleanPhone = String(cmd.phone || '').replace(/[^\d]/g, '');
                if (cleanPhone.length < 7) return { ok: false, message: 'מספר טלפון לא תקין' };
                await Reservation.update(target.id, { customer_phone: cleanPhone });
                return { ok: true, message: `בוצע ✓ טלפון עודכן ל-${cleanPhone}` };
            }

            // ---------- Mark reservation as arrived (by name, not table) ----------
            case 'reservation_mark_arrived': {
                const target = reservations.find(r =>
                    (r.customer_name || '').includes(cmd.name) &&
                    !['cancelled', 'completed', 'no_show', 'seated'].includes(r.status || 'pending')
                );
                if (!target) return { ok: false, message: `${cmd.name} לא נמצא בהזמנות פעילות` };
                await Reservation.update(target.id, { status: 'seated' });
                return { ok: true, message: `בוצע ✓ ${target.customer_name} סומן כיושב` };
            }

            // ---------- Move multi-table session: "תעביר 70 ו 71 ל-8" ----------
            case 'session_move_multi': {
                const fromList = cmd.from_tables || [];
                let movedAny = false;
                for (const from of fromList) {
                    const session = activeSessions.find(s =>
                        String(s.table_number || '').split(/[,+]/).map(p => p.trim()).includes(String(from))
                    );
                    if (session) {
                        await TableSession.update(session.id, { table_number: String(cmd.to) });
                        movedAny = true;
                    }
                    const r = reservations.find(r =>
                        Array.isArray(r.assigned_table) &&
                        r.assigned_table.map(String).includes(String(from))
                    );
                    if (r) {
                        await Reservation.update(r.id, { assigned_table: [String(cmd.to)] });
                        movedAny = true;
                    }
                }
                if (!movedAny) return { ok: false, message: `אין סשנים פעילים על ${fromList.join(', ')}` };
                return { ok: true, message: `בוצע ✓ ${fromList.join(' ו-')} הועברו ל-${cmd.to}` };
            }

            // ---------- AI seat suggestion (handoff to existing AI assistant) ----------
            case 'q_ai_seat_suggest': {
                try {
                    const result = await base44.functions.aiSeatingAssistant({
                        party_size: Number(cmd.party_size) || 2,
                        preference: cmd.preference || 'no_preference',
                        question: `מצא מקום ל-${cmd.party_size} סועדים עכשיו`,
                    });
                    const msg = result?.answer || result?.message || 'יוצר הצעות בעמוד מפת הושבה';
                    return { ok: true, message: String(msg).slice(0, 300) };
                } catch {
                    window.location.href = '/SeatingSetup';
                    return { ok: true, message: `פותח מפה — חפש מקום ל-${cmd.party_size} ידנית` };
                }
            }

            // ---------- Move session between tables ----------
            case 'session_move': {
                const session = activeSessions.find(s =>
                    String(s.table_number || '').split(/[,+]/).map(p => p.trim()).includes(String(cmd.from))
                );
                if (!session) return { ok: false, message: `אין סשן פעיל על שולחן ${cmd.from}` };
                await TableSession.update(session.id, { table_number: String(cmd.to) });
                const r = reservations.find(r =>
                    Array.isArray(r.assigned_table) &&
                    r.assigned_table.map(String).includes(String(cmd.from))
                );
                if (r) await Reservation.update(r.id, { assigned_table: [String(cmd.to)] });
                return { ok: true, message: `בוצע ✓ שולחן ${cmd.from} הועבר ל-${cmd.to}` };
            }

            // ---------- Stats queries ----------
            case 'q_today_reservations': {
                const valid = reservations.filter(r => !['cancelled', 'no_show'].includes(r.status || 'pending'));
                return { ok: true, message: `${valid.length} הזמנות היום` };
            }
            case 'q_tomorrow_reservations': {
                const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
                const tomorrowStr = tomorrow.toISOString().slice(0, 10);
                try {
                    const tomorrowRes = await Reservation.filter({ date: tomorrowStr }, 'time');
                    const valid = (tomorrowRes || []).filter(r => !['cancelled', 'no_show'].includes(r.status || 'pending'));
                    return { ok: true, message: `${valid.length} הזמנות מחר` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק מחר' }; }
            }
            case 'q_today_guests': {
                const valid = reservations.filter(r => !['cancelled', 'no_show'].includes(r.status || 'pending'));
                const guests = valid.reduce((s, r) => s + (Number(r.party_size) || 0), 0);
                return { ok: true, message: `${guests} אורחים היום` };
            }
            case 'q_today_revenue': {
                const seated = reservations.filter(r => ['seated', 'completed'].includes(r.status));
                const guests = seated.reduce((s, r) => s + (Number(r.party_size) || 0), 0);
                const revenue = guests * 220;
                return { ok: true, message: `הכנסה משוערת מ-${guests} סועדים, ${revenue} שקלים` };
            }
            case 'q_status_summary': {
                const valid = reservations.filter(r => !['cancelled', 'no_show'].includes(r.status || 'pending'));
                const seatedNow = reservations.filter(r => r.status === 'seated').length;
                const queueLen = activeQueue.length;
                return { ok: true, message: `${seatedNow} שולחנות פעילים, ${valid.length} הזמנות היום, ${queueLen} בתור` };
            }
            case 'q_on_shift': {
                try {
                    const today = new Date().toISOString().slice(0, 10);
                    const shifts = await base44.entities.WorkShift.filter({ date: today });
                    const allStaff = (shifts || []).flatMap(s => s.assigned_staff || []);
                    if (allStaff.length === 0) return { ok: true, message: 'אין משובצים היום' };
                    const names = [...new Set(allStaff.map(s => s.employee_name).filter(Boolean))];
                    return { ok: true, message: `${names.length} עובדים: ${names.slice(0, 5).join(', ')}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }

            // ---------- Navigation ----------
            case 'nav_open': {
                const TARGETS = {
                    settings_deposit: '/DepositSettings',
                    settings_reservation: '/PublicReservationSettings',
                    settings_general: '/LocationSettings',
                    work_scheduling: '/WorkScheduling',
                    dashboard: '/Dashboard',
                    seating: '/SeatingSetup',
                    queue: '/QueueDashboard',
                    events: '/EventsPrivate',
                    tips: '/Tips',
                    employees: '/Employees',
                    reports: '/Reports',
                };
                const path = TARGETS[cmd.target];
                if (!path) return { ok: false, message: 'לא ידוע איזה עמוד לפתוח' };
                window.location.href = path;
                return { ok: true, message: `פותח...` };
            }

            // ---------- Help ----------
            case 'help': {
                return { ok: true, message: 'דברים שאני מבין: לפתוח עמודים, להוסיף הזמנות, לעדכן שולחנות, לקרוא לאנשים בתור, לשלוח לצוות, לפתוח תקריות. תיכנס לעמוד בדיקת פקודות לראות הכל.' };
            }

            // ---------- Staff queries ----------
            case 'q_on_shift_now':
            case 'q_on_shift_evening':
            case 'q_on_shift_lunch':
            case 'q_on_shift_date': {
                const dateStr = (() => {
                    if (cmd.when === 'מחר') {
                        const d = new Date(); d.setDate(d.getDate() + 1);
                        return d.toISOString().slice(0, 10);
                    }
                    if (cmd.when === 'מחרתיים') {
                        const d = new Date(); d.setDate(d.getDate() + 2);
                        return d.toISOString().slice(0, 10);
                    }
                    return new Date().toISOString().slice(0, 10);
                })();
                let shiftType = cmd.shift_type;
                if (cmd.intent === 'q_on_shift_evening') shiftType = 'dinner';
                if (cmd.intent === 'q_on_shift_lunch') shiftType = 'lunch';
                if (cmd.intent === 'q_on_shift_now') {
                    const ilHour = (new Date().getUTCHours() + 3) % 24;
                    shiftType = ilHour < 16 ? 'lunch' : 'dinner';
                }
                try {
                    const shifts = await base44.entities.WorkShift.filter({ date: dateStr });
                    const filtered = shiftType ? (shifts || []).filter(s => s.shift_type === shiftType) : (shifts || []);
                    let allStaff = filtered.flatMap(s => s.assigned_staff || []);
                    // Position filter — if user asked "מי עובד היום מלצר", filter to that role.
                    if (cmd.position) {
                        const want = String(cmd.position).trim().toLowerCase();
                        // Match by includes so 'מלצר' catches 'מלצרית' too, and Hebrew/English alike.
                        allStaff = allStaff.filter(a => {
                            const p = String(a.position || '').toLowerCase();
                            return p.includes(want) || want.includes(p);
                        });
                    }
                    if (allStaff.length === 0) {
                        const when = cmd.when === 'מחר' ? 'מחר' : 'היום';
                        const slot = shiftType === 'lunch' ? 'צהריים' : shiftType === 'dinner' ? 'ערב' : '';
                        const posTxt = cmd.position ? ' כ-' + cmd.position : '';
                        return { ok: true, message: `אין משובצים${posTxt} ${when} ${slot}`.trim() };
                    }
                    // Unique by name+position so a person who works lunch+dinner shows once with both roles.
                    const seen = new Set();
                    const lines = [];
                    for (const a of allStaff) {
                        const key = (a.employee_name || '') + '|' + (a.position || '');
                        if (seen.has(key)) continue;
                        seen.add(key);
                        const role = a.position ? ` (${a.position})` : '';
                        lines.push(`${a.employee_name}${role}`);
                    }
                    const posTxt = cmd.position ? ` כ-${cmd.position}` : '';
                    return { ok: true, message: `${lines.length} עובדים${posTxt}: ${lines.join(', ')}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }

            // ---------- Customer lookup ----------
            case 'q_customer_history': {
                try {
                    const customers = await base44.entities.Customer.list();
                    const c = (customers || []).find(c => (c.name || '').includes(cmd.name));
                    if (!c) return { ok: false, message: `${cmd.name} לא נמצא במאגר לקוחות` };
                    const visits = c.visit_count || 0;
                    const lastVisit = c.last_visit ? new Date(c.last_visit).toLocaleDateString('he-IL') : 'לא ידוע';
                    return { ok: true, message: `${c.name}, ${visits} ביקורים, ביקור אחרון ${lastVisit}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }

            // ---------- Send staff schedule ----------
            case 'send_staff_schedule': {
                const dateStr = (() => {
                    if (cmd.when === 'מחר') {
                        const d = new Date(); d.setDate(d.getDate() + 1);
                        return d.toISOString().slice(0, 10);
                    }
                    return new Date().toISOString().slice(0, 10);
                })();
                try {
                    const shifts = await base44.entities.WorkShift.filter({ date: dateStr });
                    if (!shifts || shifts.length === 0) return { ok: false, message: 'אין סידור משובץ' };
                    const lines = [];
                    for (const s of shifts) {
                        const shiftName = s.shift_type === 'lunch' ? 'צהריים' : 'ערב';
                        lines.push(`*${shiftName} ${s.start_time}-${s.end_time}*`);
                        for (const a of (s.assigned_staff || [])) {
                            lines.push(`• ${a.employee_name} (${a.position || ''}) ${a.start_time || ''}-${a.end_time || ''}`);
                        }
                        lines.push('');
                    }
                    const msg = `🗓️ סידור עבודה ${cmd.when || 'היום'}\n\n${lines.join('\n')}`;
                    try { await base44.functions.sendTeamWhatsApp({ message: msg }); }
                    catch (e) { console.warn('[voice] sendTeamWhatsApp failed', e); }
                    return { ok: true, message: `בוצע ✓ סידור ${cmd.when || 'היום'} נשלח לצוות` };
                } catch { return { ok: false, message: 'לא הצלחתי לשלוח' }; }
            }

            case 'send_team_message': {
                try {
                    await base44.functions.sendTeamWhatsApp({ message: cmd.message });
                    return { ok: true, message: `בוצע ✓ הודעה נשלחה לצוות` };
                } catch { return { ok: false, message: 'שגיאה בשליחה' }; }
            }

            case 'send_customer_message': {
                const r = reservations.find(r => (r.customer_name || '').includes(cmd.name));
                if (!r?.customer_phone) return { ok: false, message: `${cmd.name} ללא טלפון רשום` };
                try {
                    await base44.functions.sendSms({ to: r.customer_phone, message: cmd.message });
                    return { ok: true, message: `בוצע ✓ הודעה נשלחה ל-${cmd.name}` };
                } catch { return { ok: false, message: 'שגיאה בשליחה' }; }
            }

            // ---------- Operations ----------
            case 'incident_open': {
                try {
                    await base44.entities.Incident.create({
                        incident_number: `VOICE-${Date.now()}`,
                        title: cmd.description || 'תקרית קולית',
                        description: cmd.description || '',
                        severity: 'low',
                        status: 'open',
                        incident_date: new Date().toISOString(),
                        reported_by: 'voice',
                    });
                    return { ok: true, message: `בוצע ✓ תקרית נפתחה` };
                } catch { return { ok: false, message: 'שגיאה ביצירת תקרית' }; }
            }

            case 'task_add': {
                try {
                    if (!base44.entities.Task?.create) return { ok: false, message: 'מערכת משימות לא זמינה' };
                    await base44.entities.Task.create({
                        title: cmd.description || 'משימה',
                        assigned_to: cmd.who || '',
                        status: 'open',
                    });
                    return { ok: true, message: `בוצע ✓ משימה נוצרה${cmd.who ? ' ל-' + cmd.who : ''}` };
                } catch { return { ok: false, message: 'שגיאה ביצירת משימה' }; }
            }

            // ---------- Customers ----------
            case 'q_birthdays_today': {
                const todays = reservations.filter(r =>
                    (r.special_occasion || '').match(/יום הולדת|birthday/i) &&
                    !['cancelled', 'no_show'].includes(r.status || 'pending')
                );
                if (todays.length === 0) return { ok: true, message: 'אין חוגגי יום הולדת היום' };
                const names = todays.map(r => `${r.customer_name} ${r.time?.slice(0,5) || ''}`).join(', ');
                return { ok: true, message: `${todays.length} חוגגים היום: ${names}` };
            }
            case 'q_returning_customers': {
                try {
                    const customers = await base44.entities.Customer.list('-visit_count', 5);
                    const top = (customers || []).filter(c => (c.visit_count || 0) >= 2);
                    if (top.length === 0) return { ok: true, message: 'אין לקוחות חוזרים' };
                    const lines = top.map(c => `${c.name || 'ללא שם'} (${c.visit_count} ביקורים)`);
                    return { ok: true, message: `${top.length} לקוחות מובילים: ${lines.join(', ')}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }
            case 'customer_set_vip': {
                try {
                    const customers = await base44.entities.Customer.list();
                    const c = (customers || []).find(c => (c.name || '').includes(cmd.name));
                    if (!c) return { ok: false, message: `${cmd.name} לא נמצא` };
                    await base44.entities.Customer.update(c.id, { loyalty_tier: 'vip' });
                    return { ok: true, message: `בוצע ✓ ${c.name} סומן כ-VIP` };
                } catch { return { ok: false, message: 'שגיאה בעדכון' }; }
            }
            case 'customer_send_coupon': {
                try {
                    const customers = await base44.entities.Customer.list();
                    const c = (customers || []).find(c => (c.name || '').includes(cmd.name));
                    if (!c) return { ok: false, message: `${cmd.name} לא נמצא` };
                    await base44.entities.CustomerBenefit.create({
                        customer_id: c.id,
                        description: cmd.description || 'הנחה 15% לביקור הבא',
                        type: 'coupon',
                        status: 'active',
                    });
                    return { ok: true, message: `בוצע ✓ קופון נוצר ל-${c.name}` };
                } catch { return { ok: false, message: 'שגיאה ביצירת קופון' }; }
            }
            case 'benefit_give': {
                try {
                    const customers = await base44.entities.Customer.list();
                    const c = (customers || []).find(c => (c.name || '').includes(cmd.name));
                    if (!c) return { ok: false, message: `${cmd.name} לא נמצא` };
                    await base44.entities.CustomerBenefit.create({
                        customer_id: c.id,
                        description: cmd.description || 'הטבה אישית',
                        type: cmd.type || 'gift',
                        status: 'active',
                    });
                    return { ok: true, message: `בוצע ✓ הטבה ניתנה ל-${c.name}` };
                } catch { return { ok: false, message: 'שגיאה' }; }
            }
            case 'q_benefits_given': {
                try {
                    const benefits = await base44.entities.CustomerBenefit.filter({ status: 'active' });
                    return { ok: true, message: `${(benefits || []).length} הטבות פעילות` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }

            // ---------- Employees extended ----------
            case 'q_new_hires_month': {
                try {
                    const emps = await base44.entities.Employee.list();
                    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
                    const recent = (emps || []).filter(e => {
                        const t = new Date(e.createdAt || e.created_date || 0).getTime();
                        return t > cutoff;
                    });
                    if (recent.length === 0) return { ok: true, message: 'אין עובדים חדשים החודש' };
                    return { ok: true, message: `${recent.length} עובדים חדשים: ${recent.map(e => e.full_name).slice(0, 5).join(', ')}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }
            case 'q_hours_worked': {
                try {
                    const emps = await base44.entities.Employee.list();
                    const emp = (emps || []).find(e => (e.full_name || '').includes(cmd.name));
                    if (!emp) return { ok: false, message: `${cmd.name} לא נמצא` };
                    const shifts = await base44.entities.ShiftTracking.filter({ employee_id: emp.id });
                    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
                    const recent = (shifts || []).filter(s => new Date(s.clock_in || 0).getTime() > cutoff && s.status === 'completed');
                    const total = recent.reduce((sum, s) => {
                        const start = new Date(s.clock_in).getTime();
                        const end = new Date(s.clock_out || Date.now()).getTime();
                        return sum + (end - start) / 3600000;
                    }, 0);
                    return { ok: true, message: `${emp.full_name}: ${Math.round(total)} שעות ב-30 יום` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }
            case 'q_on_leave': {
                try {
                    const today = new Date().toISOString().slice(0, 10);
                    const leaves = await base44.entities.LeaveRequest.filter({ status: 'approved' });
                    const active = (leaves || []).filter(l => {
                        const start = (l.start_date || '').slice(0, 10);
                        const end = (l.end_date || '').slice(0, 10);
                        return start <= today && today <= end;
                    });
                    if (active.length === 0) return { ok: true, message: 'אין עובדים בחופש היום' };
                    return { ok: true, message: `${active.length} בחופש: ${active.map(l => l.employee_name).join(', ')}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }
            case 'leave_approve': {
                try {
                    const leaves = await base44.entities.LeaveRequest.filter({ status: 'pending' });
                    const lr = (leaves || []).find(l => (l.employee_name || '').includes(cmd.name));
                    if (!lr) return { ok: false, message: `אין בקשת חופש ל-${cmd.name}` };
                    await base44.entities.LeaveRequest.update(lr.id, { status: 'approved' });
                    return { ok: true, message: `בוצע ✓ חופש של ${lr.employee_name} אושר` };
                } catch { return { ok: false, message: 'שגיאה' }; }
            }
            case 'request_swap': {
                try {
                    const emps = await base44.entities.Employee.list();
                    const emp = (emps || []).find(e => (e.full_name || '').includes(cmd.name));
                    if (!emp) return { ok: false, message: `${cmd.name} לא נמצא` };
                    const dateStr = cmd.date || new Date().toISOString().slice(0, 10);
                    await base44.entities.ShiftSwapRequest.create({
                        requester_employee_id: emp.id,
                        requester_name: emp.full_name,
                        shift_date: new Date(dateStr).toISOString(),
                        shift_type: cmd.shift_type || 'dinner',
                        status: 'pending',
                        message: 'נפתח דרך פקודה קולית',
                    });
                    return { ok: true, message: `בוצע ✓ בקשת החלפה נוצרה ל-${emp.full_name}` };
                } catch { return { ok: false, message: 'שגיאה' }; }
            }
            case 'q_late_today': {
                try {
                    const today = new Date().toISOString().slice(0, 10);
                    const shifts = await base44.entities.WorkShift.filter({ date: today });
                    const trackings = await base44.entities.ShiftTracking.list('-clock_in', 50);
                    const todayStartMs = new Date(today).getTime();
                    const late = [];
                    for (const ws of shifts || []) {
                        for (const a of (ws.assigned_staff || [])) {
                            const t = (trackings || []).find(tr =>
                                tr.employee_id === a.employee_id &&
                                new Date(tr.clock_in || 0).getTime() > todayStartMs
                            );
                            if (a.start_time && t?.clock_in) {
                                const [h, m] = a.start_time.split(':').map(Number);
                                const expected = todayStartMs + (h * 60 + m) * 60000;
                                const actual = new Date(t.clock_in).getTime();
                                if (actual > expected + 10 * 60000) {
                                    const mins = Math.round((actual - expected) / 60000);
                                    late.push(`${a.employee_name} (+${mins} דק׳)`);
                                }
                            } else if (a.start_time && !t) {
                                late.push(`${a.employee_name} (לא הגיע)`);
                            }
                        }
                    }
                    if (late.length === 0) return { ok: true, message: 'כולם בזמן היום' };
                    return { ok: true, message: `${late.length} מאחרים: ${late.join(', ')}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }

            // ---------- Inventory ----------
            case 'q_stock': {
                try {
                    const items = await base44.entities.Inventory.list();
                    const it = (items || []).find(i => (i.item_name || '').includes(cmd.item || ''));
                    if (!it) return { ok: false, message: `${cmd.item} לא במלאי` };
                    return { ok: true, message: `${it.item_name}: ${it.current_stock} ${it.unit || ''}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }
            case 'q_low_stock': {
                try {
                    const items = await base44.entities.Inventory.list();
                    const low = (items || []).filter(i =>
                        i.min_threshold && Number(i.current_stock) <= Number(i.min_threshold)
                    );
                    if (low.length === 0) return { ok: true, message: 'מלאי תקין, אין פריטים חסרים' };
                    const names = low.slice(0, 5).map(i => i.item_name).join(', ');
                    return { ok: true, message: `${low.length} פריטים במלאי נמוך: ${names}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }
            case 'inventory_add': {
                try {
                    const items = await base44.entities.Inventory.list();
                    const it = (items || []).find(i => (i.item_name || '').includes(cmd.item || ''));
                    if (!it) return { ok: false, message: `${cmd.item} לא קיים במלאי` };
                    const newStock = Number(it.current_stock || 0) + Number(cmd.quantity || 0);
                    await base44.entities.Inventory.update(it.id, {
                        current_stock: newStock,
                        last_updated: new Date().toISOString(),
                    });
                    return { ok: true, message: `בוצע ✓ ${it.item_name}: ${newStock} ${it.unit || ''}` };
                } catch { return { ok: false, message: 'שגיאה' }; }
            }
            case 'order_from_supplier': {
                try {
                    const items = await base44.entities.Inventory.list();
                    const it = (items || []).find(i => (i.item_name || '').includes(cmd.item || ''));
                    if (!it) return { ok: false, message: `${cmd.item} לא במלאי` };
                    const qty = Number(cmd.quantity) || it.reorder_quantity || 1;
                    await base44.entities.InventoryAlert.create({
                        item_name: it.item_name,
                        current_quantity: Number(it.current_stock || 0),
                        suggested_quantity: qty,
                        urgency: 'high',
                        supplier_id: it.supplier_id || null,
                        estimated_cost: qty * Number(it.cost_per_unit || 0),
                        reasoning: 'הזמנה ידנית בפקודה קולית',
                        status: 'pending',
                    });
                    return { ok: true, message: `בוצע ✓ הזמנה ל-${it.item_name} נוצרה` };
                } catch { return { ok: false, message: 'שגיאה' }; }
            }
            case 'q_supplier_of': {
                try {
                    const items = await base44.entities.Inventory.list();
                    const it = (items || []).find(i => (i.item_name || '').includes(cmd.item || ''));
                    if (!it?.supplier_id) return { ok: true, message: `${cmd.item} ללא ספק רשום` };
                    const suppliers = await base44.entities.Supplier.list();
                    const s = (suppliers || []).find(s => s.id === it.supplier_id);
                    if (!s) return { ok: false, message: 'הספק לא נמצא' };
                    return { ok: true, message: `${it.item_name} מ-${s.company_name}, ${s.phone || s.contact_person || ''}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }

            // ---------- Suppliers ----------
            case 'q_supplier_invoice': {
                try {
                    const suppliers = await base44.entities.Supplier.list();
                    const s = (suppliers || []).find(s => (s.company_name || '').includes(cmd.supplier || ''));
                    if (!s) return { ok: false, message: `ספק ${cmd.supplier} לא נמצא` };
                    const invoices = await base44.entities.Invoice.filter({ supplier_id: s.id });
                    const last = (invoices || []).sort((a, b) =>
                        new Date(b.invoice_date || 0) - new Date(a.invoice_date || 0)
                    )[0];
                    if (!last) return { ok: true, message: `אין חשבוניות ל-${s.company_name}` };
                    const d = new Date(last.invoice_date).toLocaleDateString('he-IL');
                    return { ok: true, message: `${s.company_name}, חשבונית אחרונה ${d}, ${last.total_amount}₪` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }
            case 'q_supplier_balance': {
                try {
                    const suppliers = await base44.entities.Supplier.list();
                    const s = (suppliers || []).find(s => (s.company_name || '').includes(cmd.supplier || ''));
                    if (!s) return { ok: false, message: `ספק ${cmd.supplier} לא נמצא` };
                    const invoices = await base44.entities.Invoice.filter({ supplier_id: s.id, payment_status: 'unpaid' });
                    const total = (invoices || []).reduce((sum, i) => sum + Number(i.total_amount || 0), 0);
                    return { ok: true, message: `${s.company_name}: יתרה ₪${Math.round(total)} (${(invoices || []).length} חשבוניות)` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }

            // ---------- Menu ----------
            case 'q_top_seller': {
                try {
                    const items = await base44.entities.MenuItem.list('-popularity_score', 5);
                    const top = (items || []).filter(i => (i.popularity_score || 0) > 0);
                    if (top.length === 0) return { ok: true, message: 'אין נתוני מכירות' };
                    const lines = top.map(i => `${i.name} (${i.popularity_score})`);
                    return { ok: true, message: `מובילים: ${lines.join(', ')}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }
            case 'q_today_sold': {
                try {
                    const today = new Date().toISOString().slice(0, 10);
                    const orders = await base44.entities.BeecommOrder.list('-createdAt', 100);
                    const todaysOrders = (orders || []).filter(o =>
                        (o.createdAt || '').slice(0, 10) === today
                    );
                    if (todaysOrders.length === 0) return { ok: true, message: 'אין נתוני מכירה היום (Beecomm לא מחובר?)' };
                    const total = todaysOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
                    return { ok: true, message: `${todaysOrders.length} הזמנות, ₪${Math.round(total)}` };
                } catch { return { ok: false, message: 'Beecomm לא מחובר' }; }
            }
            case 'menu_remove': {
                try {
                    const items = await base44.entities.MenuItem.list();
                    const it = (items || []).find(i => (i.name || '').includes(cmd.name));
                    if (!it) return { ok: false, message: `${cmd.name} לא בתפריט` };
                    await base44.entities.MenuItem.update(it.id, { available: false });
                    return { ok: true, message: `בוצע ✓ ${it.name} הוסר מהתפריט` };
                } catch { return { ok: false, message: 'שגיאה' }; }
            }
            case 'menu_add': {
                try {
                    await base44.entities.MenuItem.create({
                        name: cmd.name,
                        category: cmd.category || 'general',
                        price: Number(cmd.price) || 0,
                        available: true,
                    });
                    return { ok: true, message: `בוצע ✓ ${cmd.name} נוסף לתפריט ב-₪${cmd.price}` };
                } catch { return { ok: false, message: 'שגיאה' }; }
            }
            case 'q_profit_on': {
                try {
                    const items = await base44.entities.MenuItem.list();
                    const it = (items || []).find(i => (i.name || '').includes(cmd.name));
                    if (!it) return { ok: false, message: `${cmd.name} לא בתפריט` };
                    const profit = Number(it.price || 0) - Number(it.cost || 0);
                    const margin = it.price ? Math.round((profit / it.price) * 100) : 0;
                    return { ok: true, message: `${it.name}: רווח ₪${profit} (${margin}%)` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }

            // ---------- Finance ----------
            case 'q_tips_today': {
                try {
                    const today = new Date().toISOString().slice(0, 10);
                    const reports = await base44.entities.TipReport.list('-date', 10);
                    const todays = (reports || []).find(r => (r.date || '').slice(0, 10) === today);
                    if (!todays) return { ok: true, message: 'אין דוח טיפים היום' };
                    return { ok: true, message: `טיפים היום: ₪${Math.round(todays.total_tips_collected || 0)}, ₪${Math.round(todays.tip_per_hour || 0)}/שעה` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }
            case 'pay_bonus':
            case 'coins_give': {
                try {
                    const emps = await base44.entities.Employee.list();
                    const emp = (emps || []).find(e => (e.full_name || '').includes(cmd.name));
                    if (!emp) return { ok: false, message: `${cmd.name} לא נמצא` };
                    await base44.entities.CoinTransaction.create({
                        employee_id: emp.id,
                        employee_name: emp.full_name,
                        amount: Number(cmd.amount) || 10,
                        reason: cmd.reason || 'בונוס קולי',
                        type: cmd.intent === 'pay_bonus' ? 'bonus' : 'gift',
                        status: 'approved',
                    });
                    return { ok: true, message: `בוצע ✓ ${cmd.amount || 10} מטבעות ל-${emp.full_name}` };
                } catch { return { ok: false, message: 'שגיאה' }; }
            }
            case 'q_open_invoices': {
                try {
                    const invoices = await base44.entities.Invoice.filter({ payment_status: 'unpaid' });
                    const total = (invoices || []).reduce((s, i) => s + Number(i.total_amount || 0), 0);
                    return { ok: true, message: `${(invoices || []).length} חשבוניות פתוחות, סך ₪${Math.round(total)}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }
            case 'invoice_create': {
                try {
                    const suppliers = await base44.entities.Supplier.list();
                    const s = (suppliers || []).find(s => (s.company_name || '').includes(cmd.supplier || ''));
                    if (!s) return { ok: false, message: `ספק ${cmd.supplier} לא נמצא` };
                    await base44.entities.Invoice.create({
                        supplier_id: s.id,
                        invoice_date: new Date().toISOString(),
                        total_amount: Number(cmd.amount) || 0,
                        status: 'pending_review',
                        payment_status: 'unpaid',
                    });
                    return { ok: true, message: `בוצע ✓ חשבונית ₪${cmd.amount} ל-${s.company_name}` };
                } catch { return { ok: false, message: 'שגיאה' }; }
            }
            case 'q_weekly_revenue': {
                try {
                    const dates = [];
                    for (let i = 0; i < 7; i++) {
                        const d = new Date(); d.setDate(d.getDate() - i);
                        dates.push(d.toISOString().slice(0, 10));
                    }
                    const all = await Promise.all(dates.map(d =>
                        base44.entities.Reservation.filter({ date: d }).catch(() => [])
                    ));
                    const guests = all.flat().filter(r => ['seated', 'completed'].includes(r.status))
                        .reduce((s, r) => s + Number(r.party_size || 0), 0);
                    return { ok: true, message: `שבוע אחרון: ${guests} סועדים, ~₪${guests * 220}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }

            // ---------- Events ----------
            case 'q_events_week': {
                try {
                    const bookings = await base44.entities.EventBooking.list('-event_date', 30);
                    const today = new Date().toISOString().slice(0, 10);
                    const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);
                    const weekEndStr = weekEnd.toISOString().slice(0, 10);
                    const upcoming = (bookings || []).filter(b =>
                        b.event_date >= today && b.event_date <= weekEndStr &&
                        !['cancelled'].includes(b.status)
                    );
                    if (upcoming.length === 0) return { ok: true, message: 'אין אירועים השבוע' };
                    const lines = upcoming.map(b => `${b.customer_name} ${b.event_date} (${b.guest_count} סועדים)`);
                    return { ok: true, message: `${upcoming.length} אירועים: ${lines.slice(0, 3).join(' | ')}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }
            case 'q_next_event': {
                try {
                    const bookings = await base44.entities.EventBooking.list();
                    const today = new Date().toISOString().slice(0, 10);
                    const upcoming = (bookings || []).filter(b => b.event_date >= today && b.status !== 'cancelled')
                        .sort((a, b) => (a.event_date || '').localeCompare(b.event_date || ''));
                    if (upcoming.length === 0) return { ok: true, message: 'אין אירועים קרובים' };
                    const e = upcoming[0];
                    return { ok: true, message: `${e.customer_name}, ${e.event_date} ${e.event_time || ''}, ${e.guest_count} סועדים` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }
            case 'event_add': {
                try {
                    await base44.entities.EventLead.create({
                        contact_name: cmd.name,
                        contact_phone: cmd.phone || '',
                        event_date: cmd.date || '',
                        guest_count: Number(cmd.guest_count) || 0,
                        event_type: cmd.event_type || 'אירוע פרטי',
                        status: 'new',
                        source: 'voice',
                    });
                    return { ok: true, message: `בוצע ✓ ליד אירוע ל-${cmd.name} נפתח` };
                } catch { return { ok: false, message: 'שגיאה' }; }
            }
            case 'event_send_contract': {
                try {
                    const bookings = await base44.entities.EventBooking.list();
                    const b = (bookings || []).find(b => (b.customer_name || '').includes(cmd.name));
                    if (!b) return { ok: false, message: `אירוע של ${cmd.name} לא נמצא` };
                    try {
                        await base44.functions.sendEventContract({ booking_id: b.id });
                    } catch { /* function may not exist yet */ }
                    return { ok: true, message: `בוצע ✓ חוזה נשלח ל-${b.customer_name}` };
                } catch { return { ok: false, message: 'שגיאה' }; }
            }
            case 'q_event_status': {
                try {
                    const bookings = await base44.entities.EventBooking.list('-event_date', 50);
                    const b = (bookings || []).find(b => (b.customer_name || '').includes(cmd.name));
                    if (!b) return { ok: false, message: `${cmd.name} לא נמצא באירועים` };
                    return { ok: true, message: `${b.customer_name}: ${b.status || 'pending'}, ${b.event_date}, ${b.guest_count} סועדים, תשלום: ${b.payment_status || 'לא ידוע'}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }

            // ---------- Tasks / Checklists ----------
            case 'q_tasks_for': {
                try {
                    const today = new Date().toISOString().slice(0, 10);
                    const execs = await base44.entities.ChecklistExecution.list('-execution_date', 50);
                    const todays = (execs || []).filter(e =>
                        (e.execution_date || '').slice(0, 10) === today &&
                        (e.executed_by_name || '').includes(cmd.name) &&
                        e.status !== 'completed'
                    );
                    if (todays.length === 0) return { ok: true, message: `אין משימות פתוחות ל-${cmd.name}` };
                    return { ok: true, message: `${todays.length} משימות פתוחות ל-${cmd.name}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }
            case 'q_checklist_done': {
                try {
                    const today = new Date().toISOString().slice(0, 10);
                    const execs = await base44.entities.ChecklistExecution.list('-execution_date', 50);
                    const done = (execs || []).filter(e =>
                        (e.execution_date || '').slice(0, 10) === today && e.status === 'completed'
                    );
                    return { ok: true, message: `${done.length} צ׳קליסטים הושלמו היום` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }
            case 'checklist_mark_done': {
                try {
                    const today = new Date().toISOString().slice(0, 10);
                    const execs = await base44.entities.ChecklistExecution.list('-execution_date', 50);
                    const target = (execs || []).find(e =>
                        (e.execution_date || '').slice(0, 10) === today &&
                        e.status === 'in_progress'
                    );
                    if (!target) return { ok: false, message: 'אין צ׳קליסט פתוח' };
                    await base44.entities.ChecklistExecution.update(target.id, { status: 'completed' });
                    return { ok: true, message: `בוצע ✓ צ׳קליסט סומן כהושלם` };
                } catch { return { ok: false, message: 'שגיאה' }; }
            }
            case 'checklist_open': {
                try {
                    const all = await base44.entities.Checklist.filter({ status: 'active' });
                    const lines = (all || []).slice(0, 5).map(c => c.title).join(', ');
                    return { ok: true, message: `${(all || []).length} צ׳קליסטים פעילים: ${lines}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }

            // ---------- Incidents ----------
            case 'q_open_incidents': {
                try {
                    const incidents = await base44.entities.Incident.filter({ status: 'open' });
                    if ((incidents || []).length === 0) return { ok: true, message: 'אין תקריות פתוחות' };
                    const lines = incidents.slice(0, 3).map(i => i.title).join(', ');
                    return { ok: true, message: `${incidents.length} תקריות פתוחות: ${lines}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }
            case 'incident_close': {
                try {
                    const incidents = await base44.entities.Incident.filter({ status: 'open' });
                    let target;
                    if (cmd.description) {
                        target = (incidents || []).find(i =>
                            (i.title || '').includes(cmd.description) ||
                            (i.description || '').includes(cmd.description)
                        );
                    } else {
                        target = (incidents || [])[0];
                    }
                    if (!target) return { ok: false, message: 'תקרית לא נמצאה' };
                    await base44.entities.Incident.update(target.id, { status: 'closed' });
                    return { ok: true, message: `בוצע ✓ תקרית "${target.title}" נסגרה` };
                } catch { return { ok: false, message: 'שגיאה' }; }
            }

            // ---------- Marketing ----------
            case 'campaign_broadcast': {
                try {
                    const customers = await base44.entities.Customer.list();
                    const targets = (customers || []).filter(c =>
                        c.marketing_consent && c.phone && !c.marketing_unsubscribed_at
                    );
                    let sent = 0;
                    for (const c of targets.slice(0, 200)) {
                        try {
                            await base44.functions.sendSms({ to: c.phone, message: cmd.message });
                            sent++;
                        } catch { /* continue */ }
                    }
                    return { ok: true, message: `בוצע ✓ נשלח ל-${sent} לקוחות` };
                } catch { return { ok: false, message: 'שגיאה בשליחה' }; }
            }
            case 'q_campaign_success': {
                try {
                    const logs = await base44.entities.CampaignLog.list('-createdAt', 10);
                    if (!logs?.length) return { ok: true, message: 'אין נתוני קמפיינים' };
                    const last = logs[0];
                    return { ok: true, message: `קמפיין אחרון: ${last.sent_count || 0} נשלחו, ${last.delivered_count || 0} הגיעו` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }
            case 'popup_activate': {
                try {
                    const popups = await base44.entities.Popup.list();
                    const p = (popups || []).find(p => (p.title || '').includes(cmd.title || ''));
                    if (!p) return { ok: false, message: `פופאפ ${cmd.title} לא נמצא` };
                    await base44.entities.Popup.update(p.id, { is_active: true });
                    return { ok: true, message: `בוצע ✓ פופאפ "${p.title}" הופעל` };
                } catch { return { ok: false, message: 'שגיאה' }; }
            }

            // ---------- Gamification ----------
            case 'q_leaderboard': {
                try {
                    const txs = await base44.entities.CoinTransaction.list('-createdAt', 500);
                    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
                    const totals = new Map();
                    for (const t of (txs || [])) {
                        if (new Date(t.createdAt || 0).getTime() < cutoff) continue;
                        const key = t.employee_name || t.employee_id;
                        totals.set(key, (totals.get(key) || 0) + Number(t.amount || 0));
                    }
                    const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
                    if (top.length === 0) return { ok: true, message: 'אין נתוני לוח שיאים' };
                    const lines = top.map(([n, a]) => `${n}: ${Math.round(a)}`).join(', ');
                    return { ok: true, message: `לוח שיאים: ${lines}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }
            case 'q_employee_score': {
                try {
                    const emps = await base44.entities.Employee.list();
                    const emp = (emps || []).find(e => (e.full_name || '').includes(cmd.name));
                    if (!emp) return { ok: false, message: `${cmd.name} לא נמצא` };
                    const txs = await base44.entities.CoinTransaction.filter({ employee_id: emp.id });
                    const total = (txs || []).reduce((s, t) => s + Number(t.amount || 0), 0);
                    return { ok: true, message: `${emp.full_name}: ${Math.round(total)} מטבעות` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }

            // ---------- Devices ----------
            case 'q_who_has_ipad': {
                try {
                    const devices = await base44.entities.DeviceAsset.list();
                    const out = (devices || []).filter(d =>
                        d.status === 'checked_out' && d.current_holder_name
                    );
                    if (out.length === 0) return { ok: true, message: 'אף אחד לא לקח מכשיר' };
                    const lines = out.map(d => `#${d.device_number} → ${d.current_holder_name}`).join(', ');
                    return { ok: true, message: `${out.length} מכשירים בשימוש: ${lines}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }
            case 'return_device': {
                try {
                    const devices = await base44.entities.DeviceAsset.list();
                    const d = (devices || []).find(d =>
                        String(d.device_number) === String(cmd.device_number) && d.status === 'checked_out'
                    );
                    if (!d) return { ok: false, message: `מכשיר ${cmd.device_number} לא בשימוש` };
                    await base44.entities.DeviceAsset.update(d.id, {
                        status: 'available',
                        current_holder_id: null,
                        current_holder_name: null,
                        returned_at: new Date().toISOString(),
                    });
                    return { ok: true, message: `בוצע ✓ מכשיר #${d.device_number} הוחזר` };
                } catch { return { ok: false, message: 'שגיאה' }; }
            }
            case 'q_device_count': {
                try {
                    const devices = await base44.entities.DeviceAsset.list();
                    const total = (devices || []).length;
                    const out = (devices || []).filter(d => d.status === 'checked_out').length;
                    return { ok: true, message: `${total} מכשירים, ${total - out} זמינים, ${out} בשימוש` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }

            // ---------- Beecomm POS ----------
            case 'q_open_orders': {
                try {
                    const orders = await base44.entities.BeecommOrder.filter({ status: 'sent' });
                    return { ok: true, message: `${(orders || []).length} הזמנות פעילות` };
                } catch { return { ok: true, message: 'Beecomm לא מחובר עדיין' }; }
            }
            case 'q_avg_wait': {
                return { ok: true, message: 'מצריך חיבור Beecomm POS' };
            }

            // ---------- Training ----------
            case 'q_who_didnt_finish_course': {
                try {
                    const enrollments = await base44.entities.TrainingEnrollment.list();
                    const open = (enrollments || []).filter(e => e.completion_status !== 'completed');
                    if (open.length === 0) return { ok: true, message: 'כולם סיימו הכשרות' };
                    const names = [...new Set(open.map(e => e.employee_name).filter(Boolean))].slice(0, 5);
                    return { ok: true, message: `${open.length} לא סיימו: ${names.join(', ')}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }

            // ---------- Couriers / Deliveries ----------
            case 'q_active_courier': {
                try {
                    const couriers = await base44.entities.Courier.list();
                    const active = (couriers || []).filter(c => c.status === 'active' || c.status === 'on_shift');
                    if (active.length === 0) return { ok: true, message: 'אין שליחים פעילים' };
                    return { ok: true, message: `${active.length} שליחים: ${active.map(c => c.name || c.full_name).join(', ')}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }
            case 'q_deliveries_today': {
                try {
                    const today = new Date().toISOString().slice(0, 10);
                    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
                    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
                    const deliveries = await base44.entities.Delivery.list('-date', 100);
                    const todays = (deliveries || []).filter(d => {
                        const dStr = (d.date || '').slice(0, 10);
                        return dStr >= today && dStr < tomorrowStr;
                    });
                    const total = todays.reduce((s, d) => s + Number(d.total_delivery_amount || d.cash_amount || 0), 0);
                    return { ok: true, message: `${todays.length} משלוחים היום, ₪${Math.round(total)}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }
            case 'courier_assign': {
                try {
                    const deliveries = await base44.entities.Delivery.filter({ delivery_status: 'pending' });
                    const d = (deliveries || [])[0];
                    if (!d) return { ok: false, message: 'אין משלוחים פתוחים' };
                    await base44.entities.Delivery.update(d.id, { courier_name: cmd.courier });
                    return { ok: true, message: `בוצע ✓ ${cmd.courier} שובץ למשלוח` };
                } catch { return { ok: false, message: 'שגיאה' }; }
            }

            // ---------- Settings ----------
            case 'settings_change_cancellation': {
                try {
                    const all = await base44.entities.DepositSettings.list();
                    const s = (all || [])[0];
                    if (!s) return { ok: false, message: 'אין הגדרות פיקדון' };
                    const hours = Number(cmd.hours) || 6;
                    await base44.entities.DepositSettings.update(s.id, { cancellation_window_hours: hours });
                    return { ok: true, message: `בוצע ✓ חלון ביטול עודכן ל-${hours} שעות` };
                } catch { return { ok: false, message: 'שגיאה' }; }
            }
            case 'settings_change_deposit_pct': {
                try {
                    const all = await base44.entities.DepositSettings.list();
                    const s = (all || [])[0];
                    if (!s) return { ok: false, message: 'אין הגדרות פיקדון' };
                    const pct = Number(cmd.pct) || 20;
                    await base44.entities.DepositSettings.update(s.id, { event_deposit_percent: pct });
                    return { ok: true, message: `בוצע ✓ אחוז פיקדון אירועים עודכן ל-${pct}%` };
                } catch { return { ok: false, message: 'שגיאה' }; }
            }
            case 'online_reservations_toggle': {
                try {
                    const all = await base44.entities.ReservationSettings.list();
                    const s = (all || [])[0];
                    if (!s) return { ok: false, message: 'אין הגדרות הזמנות' };
                    const newVal = cmd.enabled === undefined ? !s.online_reservations_enabled : !!cmd.enabled;
                    await base44.entities.ReservationSettings.update(s.id, { online_reservations_enabled: newVal });
                    return { ok: true, message: `בוצע ✓ הזמנות אונליין ${newVal ? 'הופעלו' : 'כובו'}` };
                } catch { return { ok: false, message: 'שגיאה' }; }
            }
            case 'table_add': {
                window.location.href = '/SeatingSetup';
                return { ok: true, message: 'פותח מפת הושבה — הוסף שולחן ידנית' };
            }

            // ---------- Reports ----------
            case 'report_generate_monthly':
            case 'report_send_weekly_whatsapp':
            case 'report_export_excel': {
                window.location.href = '/Reports';
                return { ok: true, message: 'פותח דוחות' };
            }

            // ---------- ShiftChat ----------
            case 'chat_broadcast': {
                try {
                    let me;
                    try { me = await base44.entities.User.me(); } catch {}
                    const today = new Date();
                    const ilHour = (today.getUTCHours() + 3) % 24;
                    await base44.entities.ShiftMessage.create({
                        sender_id: me?.id || 'voice',
                        sender_name: me?.full_name || 'מנהל',
                        sender_role: 'manager',
                        message: cmd.message,
                        shift_date: today.toISOString(),
                        shift_type: ilHour < 16 ? 'lunch' : 'dinner',
                        message_type: 'text',
                    });
                    return { ok: true, message: `בוצע ✓ הודעה נשלחה לצ׳אט משמרת` };
                } catch { return { ok: false, message: 'שגיאה' }; }
            }
            case 'q_today_chat': {
                try {
                    const today = new Date().toISOString().slice(0, 10);
                    const msgs = await base44.entities.ShiftMessage.list('-shift_date', 100);
                    const todays = (msgs || []).filter(m =>
                        (m.shift_date || '').slice(0, 10) === today
                    );
                    return { ok: true, message: `${todays.length} הודעות בצ׳אט היום` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }

            // ---------- Restroom ----------
            case 'q_last_clean': {
                try {
                    const checks = await base44.entities.RestroomCheck.list('-checked_at', 5);
                    if (!checks?.length) return { ok: true, message: 'אין נתוני ניקיון' };
                    const last = checks[0];
                    const dt = new Date(last.checked_at);
                    const mins = Math.round((Date.now() - dt.getTime()) / 60000);
                    return { ok: true, message: `נוקה לפני ${mins} דק׳ ע״י ${last.checked_by_name || 'לא ידוע'}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }
            case 'mark_clean': {
                try {
                    let me;
                    try { me = await base44.entities.User.me(); } catch {}
                    await base44.entities.RestroomCheck.create({
                        checked_by_id: me?.id || 'voice',
                        checked_by_name: me?.full_name || 'מנהל',
                        checked_at: new Date().toISOString(),
                        notes: 'נסמן דרך פקודה קולית',
                        shift_date: new Date().toISOString().slice(0, 10),
                    });
                    return { ok: true, message: `בוצע ✓ ניקיון סומן` };
                } catch { return { ok: false, message: 'שגיאה' }; }
            }

            // ---------- Schedule add ----------
            case 'schedule_add': {
                try {
                    const dateStr = (() => {
                        if (cmd.date) return cmd.date;
                        if (cmd.when === 'מחר') {
                            const d = new Date(); d.setDate(d.getDate() + 1);
                            return d.toISOString().slice(0, 10);
                        }
                        return new Date().toISOString().slice(0, 10);
                    })();
                    const shiftType = cmd.shift_type || 'dinner';
                    const emps = await base44.entities.Employee.list();
                    const emp = (emps || []).find(e => (e.full_name || '').includes(cmd.name));
                    if (!emp) return { ok: false, message: `${cmd.name} לא נמצא` };
                    const existing = await base44.entities.WorkShift.filter({ date: dateStr });
                    let shift = (existing || []).find(s => s.shift_type === shiftType);
                    if (!shift) {
                        shift = await base44.entities.WorkShift.create({
                            date: dateStr,
                            shift_type: shiftType,
                            start_time: shiftType === 'lunch' ? '12:00' : '18:00',
                            end_time: shiftType === 'lunch' ? '17:00' : '00:00',
                            assigned_staff: [],
                        });
                    }
                    const staff = Array.isArray(shift.assigned_staff) ? [...shift.assigned_staff] : [];
                    if (staff.some(a => a.employee_id === emp.id)) {
                        return { ok: true, message: `${emp.full_name} כבר משובץ` };
                    }
                    staff.push({
                        employee_id: emp.id,
                        employee_name: emp.full_name,
                        position: emp.role || cmd.position || '',
                        start_time: shift.start_time,
                        end_time: shift.end_time,
                    });
                    await base44.entities.WorkShift.update(shift.id, { assigned_staff: staff });
                    return { ok: true, message: `בוצע ✓ ${emp.full_name} שובץ ל-${shiftType === 'lunch' ? 'צהריים' : 'ערב'} ${dateStr}` };
                } catch { return { ok: false, message: 'שגיאה' }; }
            }

            // ---------- Schedule remove ----------
            case 'schedule_remove': {
                try {
                    if (!cmd.name) return { ok: false, message: 'לא בטוח את מי להוריד — תגיד את השם' };
                    const dateStr = (() => {
                        if (cmd.date) return cmd.date;
                        if (cmd.when === 'מחר') {
                            const d = new Date(); d.setDate(d.getDate() + 1);
                            return d.toISOString().slice(0, 10);
                        }
                        if (cmd.when === 'מחרתיים') {
                            const d = new Date(); d.setDate(d.getDate() + 2);
                            return d.toISOString().slice(0, 10);
                        }
                        return new Date().toISOString().slice(0, 10);
                    })();
                    // Get all shifts for this date (could be multiple — lunch + dinner)
                    const shifts = await base44.entities.WorkShift.filter({ date: dateStr });
                    if (!shifts || shifts.length === 0) {
                        return { ok: false, message: `אין משמרת ב-${dateStr}` };
                    }
                    // Filter to specific shift_type if given
                    const relevant = cmd.shift_type
                        ? shifts.filter(s => s.shift_type === cmd.shift_type)
                        : shifts;
                    let removedFrom = 0;
                    for (const shift of relevant) {
                        const staff = Array.isArray(shift.assigned_staff) ? shift.assigned_staff : [];
                        const filtered = staff.filter(a => !(a.employee_name || '').includes(cmd.name));
                        if (filtered.length < staff.length) {
                            await base44.entities.WorkShift.update(shift.id, { assigned_staff: filtered });
                            removedFrom++;
                        }
                    }
                    if (removedFrom === 0) {
                        return { ok: false, message: `${cmd.name} לא משובץ למשמרת ב-${dateStr}` };
                    }
                    return { ok: true, message: `בוצע ✓ ${cmd.name} הוסר/ה מ-${removedFrom} משמרת/ות ב-${dateStr}` };
                } catch { return { ok: false, message: 'שגיאה' }; }
            }

            case 'sale_credit': {
                try {
                    const data = await base44.functions.getActiveSalesGoals({});
                    const goal = (data.goals || []).find(g =>
                        g.dish_label && cmd.dish && (g.dish_label.includes(cmd.dish) || cmd.dish.includes(g.dish_label))
                    );
                    if (!goal) return { ok: false, message: `אין יעד פעיל ל-${cmd.dish}` };
                    const emps = await base44.entities.Employee.list();
                    const waiter = (emps || []).find(e => (e.full_name || '').includes(cmd.name));
                    if (!waiter) return { ok: false, message: `${cmd.name} לא נמצא` };
                    const r = await base44.functions.creditSale({ goal_id: goal.id, waiter_id: waiter.id });
                    broadcastDataChange('sales:credited');
                    return { ok: true, message: `בוצע ✓ +1 ${goal.dish_label} ל-${waiter.full_name} (${r.new_count}/${goal.target})` };
                } catch (e) { return { ok: false, message: e?.message || 'שגיאה' }; }
            }
            case 'sales_goal_activate': {
                try {
                    const templates = await base44.entities.SalesGoalTemplate.filter({ is_active: true });
                    const t = (templates || []).find(t =>
                        (t.name || '').includes(cmd.template) || (t.dish_label || '').includes(cmd.template)
                    );
                    if (!t) return { ok: false, message: `תבנית ${cmd.template} לא נמצאה` };
                    await base44.functions.activateSalesGoal({ template_id: t.id });
                    broadcastDataChange('sales:goal-activated');
                    return { ok: true, message: `בוצע ✓ יעד ${t.name} הופעל` };
                } catch (e) { return { ok: false, message: e?.message || 'שגיאה' }; }
            }
            case 'q_sales_status': {
                try {
                    const data = await base44.functions.getActiveSalesGoals({});
                    const goals = data.goals || [];
                    if (goals.length === 0) return { ok: true, message: 'אין יעדים פעילים' };
                    const target = cmd.dish
                        ? goals.find(g => g.dish_label.includes(cmd.dish))
                        : goals[0];
                    if (!target) return { ok: true, message: `אין יעד ל-${cmd.dish}` };
                    const leader = target.leaderboard[0];
                    const leaderMsg = leader ? ` המוביל ${leader.name} עם ${leader.count}` : '';
                    return { ok: true, message: `${target.dish_label}: ${target.current_count} מתוך ${target.target}.${leaderMsg}` };
                } catch (e) { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }
            case 'q_sales_leader': {
                try {
                    const data = await base44.functions.getShiftLeaderboard({});
                    const board = data.board || [];
                    if (board.length === 0) return { ok: true, message: 'אין נתוני מכירות עדיין' };
                    const top = board[0];
                    return { ok: true, message: `${top.name}, ${top.sales} מכירות, ${top.coins} מטבעות` };
                } catch (e) { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }
            // ---------- WorkSchedule: change employee start/end time ----------
            case 'schedule_set_end_time':
            case 'schedule_set_start_time': {
                const field = cmd.intent === 'schedule_set_end_time' ? 'end_time' : 'start_time';
                const dateStr = resolveWhenDate(cmd.when);
                try {
                    const shifts = await base44.entities.WorkShift.filter({ date: dateStr });
                    if (!shifts || shifts.length === 0) return { ok: false, message: `אין סידור ל-${cmd.when || 'היום'}` };
                    let updated = 0;
                    let employeeFullName = cmd.name;
                    for (const s of shifts) {
                        const staff = Array.isArray(s.assigned_staff) ? [...s.assigned_staff] : [];
                        if (cmd.shift_type && s.shift_type !== cmd.shift_type) continue;
                        let touched = false;
                        for (let i = 0; i < staff.length; i++) {
                            const a = staff[i];
                            if ((a.employee_name || '').includes(cmd.name)) {
                                staff[i] = { ...a, [field]: cmd.time };
                                employeeFullName = a.employee_name || cmd.name;
                                touched = true;
                                updated++;
                            }
                        }
                        if (touched) {
                            await base44.entities.WorkShift.update(s.id, { assigned_staff: staff });
                        }
                    }
                    if (!updated) return { ok: false, message: `${cmd.name} לא בסידור ${cmd.when || 'היום'}` };
                    const label = field === 'end_time' ? 'יציאה' : 'כניסה';
                    return { ok: true, message: `בוצע ✓ ${employeeFullName} ${label} ל-${cmd.time}` };
                } catch (e) { return { ok: false, message: 'שגיאה בעדכון סידור: ' + (e?.message || '') }; }
            }

            // ---------- Tips: sync hours from WorkShift schedule into TipReport ----------
            case 'tips_sync_hours': {
                const dateStr = resolveWhenDate(cmd.when);
                const shiftType = cmd.shift_type || null;
                try {
                    const shifts = await base44.entities.WorkShift.filter({ date: dateStr });
                    if (!shifts || shifts.length === 0) return { ok: false, message: `אין סידור ל-${cmd.when || 'היום'}` };
                    // Aggregate per-employee scheduled hours
                    const hoursByName = new Map();
                    for (const s of shifts) {
                        if (shiftType && s.shift_type !== shiftType) continue;
                        for (const a of (s.assigned_staff || [])) {
                            const start = a.start_time || s.start_time;
                            const end = a.end_time || s.end_time;
                            if (!start || !end) continue;
                            const [sh, sm] = start.split(':').map(Number);
                            const [eh, em] = end.split(':').map(Number);
                            let hours = ((eh * 60 + (em || 0)) - (sh * 60 + (sm || 0))) / 60;
                            if (hours < 0) hours += 24;
                            const prev = hoursByName.get(a.employee_name) || { hours: 0, position: a.position };
                            hoursByName.set(a.employee_name, { hours: prev.hours + hours, position: a.position });
                        }
                    }
                    if (hoursByName.size === 0) return { ok: false, message: 'אין עובדים בסידור לסנכרון' };
                    // Find / create TipReport for the date
                    const reports = await base44.entities.TipReport.list('-date', 50);
                    let report = (reports || []).find(r => (r.date || '').slice(0, 10) === dateStr && (!shiftType || r.shift_type === shiftType));
                    const staffDetails = Array.from(hoursByName.entries()).map(([name, v]) => ({
                        employee_name: name,
                        hours: Number(v.hours.toFixed(2)),
                        position: v.position || '',
                    }));
                    if (report) {
                        // Preserve existing tip amounts per-employee if present
                        const existingById = new Map((report.staff_details || []).map(x => [x.employee_name, x]));
                        const merged = staffDetails.map(x => ({ ...existingById.get(x.employee_name), ...x }));
                        await base44.entities.TipReport.update(report.id, { staff_details: merged });
                    } else {
                        report = await base44.entities.TipReport.create({
                            date: dateStr,
                            total_tips_collected: 0,
                            staff_details: staffDetails,
                            shift_type: shiftType || undefined,
                            status: 'draft',
                        });
                    }
                    const totalHours = staffDetails.reduce((s, x) => s + x.hours, 0);
                    return { ok: true, message: `בוצע ✓ סונכרנו שעות ל-${staffDetails.length} עובדים (${totalHours.toFixed(1)} שעות סה"כ)` };
                } catch (e) { return { ok: false, message: 'שגיאה בסנכרון: ' + (e?.message || '') }; }
            }

            // ---------- Tips: set total collected, recalc tip_per_hour ----------
            case 'tips_set_total': {
                const dateStr = resolveWhenDate(cmd.when);
                const shiftType = cmd.shift_type || null;
                const amount = Number(cmd.amount) || 0;
                if (amount <= 0) return { ok: false, message: 'סכום טיפים לא תקין' };
                try {
                    const reports = await base44.entities.TipReport.list('-date', 50);
                    let report = (reports || []).find(r => (r.date || '').slice(0, 10) === dateStr && (!shiftType || r.shift_type === shiftType));
                    if (!report) {
                        report = await base44.entities.TipReport.create({
                            date: dateStr, total_tips_collected: amount,
                            staff_details: [], shift_type: shiftType || undefined, status: 'draft',
                        });
                    } else {
                        await base44.entities.TipReport.update(report.id, { total_tips_collected: amount });
                    }
                    // Recalc tip_per_hour based on aggregated staff_details hours
                    const totalHours = (report.staff_details || []).reduce((s, x) => s + (Number(x.hours) || 0), 0);
                    const tipPerHour = totalHours > 0 ? Math.round(amount / totalHours) : 0;
                    await base44.entities.TipReport.update(report.id, { tip_per_hour: tipPerHour });
                    return { ok: true, message: `בוצע ✓ טיפים ${amount}₪, ${tipPerHour}₪/שעה (${totalHours.toFixed(1)} שעות)` };
                } catch (e) { return { ok: false, message: 'שגיאה: ' + (e?.message || '') }; }
            }

            // ---------- Tips per hour query ----------
            case 'q_tips_per_hour': {
                const dateStr = resolveWhenDate(cmd.when);
                try {
                    const reports = await base44.entities.TipReport.list('-date', 50);
                    const report = (reports || []).find(r => (r.date || '').slice(0, 10) === dateStr);
                    if (!report) return { ok: true, message: `אין דוח טיפים ל-${cmd.when || 'היום'}` };
                    const total = Math.round(Number(report.total_tips_collected) || 0);
                    const totalHours = (report.staff_details || []).reduce((s, x) => s + (Number(x.hours) || 0), 0);
                    const tph = totalHours > 0 ? Math.round(total / totalHours) : (Number(report.tip_per_hour) || 0);
                    return { ok: true, message: `${total}₪ טיפים, ${totalHours.toFixed(1)} שעות, ${tph}₪ לשעה` };
                } catch (e) { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }

            // ---------- Clock-in / Clock-out / Breaks ----------
            case 'clock_in': {
                try {
                    const emps = await base44.entities.Employee.list();
                    const emp = (emps || []).find(e => (e.full_name || '').includes(cmd.name));
                    if (!emp) return { ok: false, message: `${cmd.name} לא נמצא` };
                    const todayStr = new Date().toISOString().slice(0, 10);
                    const existing = await base44.entities.ShiftTracking.filter({ employee_id: emp.id });
                    const active = (existing || []).find(s => s.status === 'active' && (s.date || '').slice(0, 10) === todayStr);
                    if (active) return { ok: false, message: `${emp.full_name} כבר פעיל מ-${new Date(active.shift_start).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` };
                    await base44.entities.ShiftTracking.create({
                        employee_id: emp.id,
                        employee_name: emp.full_name,
                        date: new Date().toISOString(),
                        shift_start: new Date().toISOString(),
                        status: 'active',
                    });
                    return { ok: true, message: `בוצע ✓ ${emp.full_name} נכנס למשמרת` };
                } catch (e) { return { ok: false, message: 'שגיאה: ' + (e?.message || '') }; }
            }
            case 'clock_out': {
                try {
                    const emps = await base44.entities.Employee.list();
                    const emp = (emps || []).find(e => (e.full_name || '').includes(cmd.name));
                    if (!emp) return { ok: false, message: `${cmd.name} לא נמצא` };
                    const tracks = await base44.entities.ShiftTracking.filter({ employee_id: emp.id });
                    const active = (tracks || []).find(t => t.status === 'active');
                    if (!active) return { ok: false, message: `${emp.full_name} לא בעבודה כרגע` };
                    const now = new Date();
                    const start = new Date(active.shift_start);
                    const totalHours = (now - start) / 3600000;
                    const breakMin = Number(active.total_break_minutes) || 0;
                    const effective = Math.max(0, totalHours - breakMin / 60);
                    await base44.entities.ShiftTracking.update(active.id, {
                        shift_end: now.toISOString(),
                        status: 'completed',
                        total_hours: Number(totalHours.toFixed(2)),
                        effective_hours: Number(effective.toFixed(2)),
                    });
                    return { ok: true, message: `בוצע ✓ ${emp.full_name} יצא — ${effective.toFixed(1)} שעות עבודה` };
                } catch (e) { return { ok: false, message: 'שגיאה: ' + (e?.message || '') }; }
            }
            case 'break_start': {
                try {
                    const emps = await base44.entities.Employee.list();
                    const emp = (emps || []).find(e => (e.full_name || '').includes(cmd.name));
                    if (!emp) return { ok: false, message: `${cmd.name} לא נמצא` };
                    const tracks = await base44.entities.ShiftTracking.filter({ employee_id: emp.id });
                    const active = (tracks || []).find(t => t.status === 'active');
                    if (!active) return { ok: false, message: `${emp.full_name} לא בעבודה` };
                    const breaks = Array.isArray(active.breaks) ? [...active.breaks] : [];
                    const openBreak = breaks.find(b => !b.end);
                    if (openBreak) return { ok: false, message: `${emp.full_name} כבר בהפסקה` };
                    breaks.push({ start: new Date().toISOString(), end: null });
                    await base44.entities.ShiftTracking.update(active.id, { breaks });
                    return { ok: true, message: `בוצע ✓ ${emp.full_name} יצא להפסקה` };
                } catch (e) { return { ok: false, message: 'שגיאה: ' + (e?.message || '') }; }
            }
            case 'break_end': {
                try {
                    const emps = await base44.entities.Employee.list();
                    const emp = (emps || []).find(e => (e.full_name || '').includes(cmd.name));
                    if (!emp) return { ok: false, message: `${cmd.name} לא נמצא` };
                    const tracks = await base44.entities.ShiftTracking.filter({ employee_id: emp.id });
                    const active = (tracks || []).find(t => t.status === 'active');
                    if (!active) return { ok: false, message: `${emp.full_name} לא בעבודה` };
                    const breaks = Array.isArray(active.breaks) ? [...active.breaks] : [];
                    const openIdx = breaks.findIndex(b => !b.end);
                    if (openIdx < 0) return { ok: false, message: `${emp.full_name} לא בהפסקה` };
                    const endTime = new Date().toISOString();
                    const startTime = new Date(breaks[openIdx].start);
                    const mins = Math.round((new Date(endTime) - startTime) / 60000);
                    breaks[openIdx] = { ...breaks[openIdx], end: endTime, minutes: mins };
                    const totalMin = breaks.reduce((s, b) => s + (Number(b.minutes) || 0), 0);
                    await base44.entities.ShiftTracking.update(active.id, { breaks, total_break_minutes: totalMin });
                    return { ok: true, message: `בוצע ✓ ${emp.full_name} חזר מהפסקה (${mins} דק׳)` };
                } catch (e) { return { ok: false, message: 'שגיאה: ' + (e?.message || '') }; }
            }
            case 'q_clocked_in_now': {
                try {
                    const tracks = await base44.entities.ShiftTracking.list('-shift_start', 30);
                    const active = (tracks || []).filter(t => t.status === 'active');
                    if (active.length === 0) return { ok: true, message: 'אין עובדים פעילים כרגע' };
                    const names = active.map(t => t.employee_name).join(', ');
                    return { ok: true, message: `${active.length} פעילים: ${names}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }

            // ---------- Schedule: change position in shift ----------
            case 'schedule_change_position': {
                const dateStr = resolveWhenDate(cmd.when);
                try {
                    const shifts = await base44.entities.WorkShift.filter({ date: dateStr });
                    if (!shifts || shifts.length === 0) return { ok: false, message: `אין סידור ל-${cmd.when || 'היום'}` };
                    let updated = 0, fullName = cmd.name;
                    for (const s of shifts) {
                        if (cmd.shift_type && s.shift_type !== cmd.shift_type) continue;
                        const staff = Array.isArray(s.assigned_staff) ? [...s.assigned_staff] : [];
                        let touched = false;
                        for (let i = 0; i < staff.length; i++) {
                            if ((staff[i].employee_name || '').includes(cmd.name)) {
                                staff[i] = { ...staff[i], position: cmd.position };
                                fullName = staff[i].employee_name || cmd.name;
                                touched = true; updated++;
                            }
                        }
                        if (touched) await base44.entities.WorkShift.update(s.id, { assigned_staff: staff });
                    }
                    if (!updated) return { ok: false, message: `${cmd.name} לא בסידור` };
                    return { ok: true, message: `בוצע ✓ ${fullName} → ${cmd.position}` };
                } catch (e) { return { ok: false, message: 'שגיאה: ' + (e?.message || '') }; }
            }

            // ---------- Tips: add employee manually ----------
            case 'tips_add_employee': {
                const dateStr = resolveWhenDate(cmd.when);
                try {
                    const reports = await base44.entities.TipReport.list('-date', 50);
                    let report = (reports || []).find(r => (r.date || '').slice(0, 10) === dateStr);
                    const newEntry = { employee_name: cmd.name, hours: Number(cmd.hours) || 0, position: cmd.position || '' };
                    if (!report) {
                        report = await base44.entities.TipReport.create({
                            date: dateStr, total_tips_collected: 0,
                            staff_details: [newEntry], status: 'draft',
                        });
                    } else {
                        const staff = [...(report.staff_details || [])];
                        const i = staff.findIndex(x => (x.employee_name || '').includes(cmd.name));
                        if (i >= 0) staff[i] = { ...staff[i], hours: newEntry.hours };
                        else staff.push(newEntry);
                        await base44.entities.TipReport.update(report.id, { staff_details: staff });
                    }
                    return { ok: true, message: `בוצע ✓ ${cmd.name} נוסף לדוח טיפים (${cmd.hours} שעות)` };
                } catch (e) { return { ok: false, message: 'שגיאה: ' + (e?.message || '') }; }
            }

            // ---------- Events: update / cancel / payment ----------
            case 'event_update_date':
            case 'event_update_guests':
            case 'event_cancel':
            case 'event_payment_received': {
                try {
                    const bookings = await base44.entities.EventBooking.list('-event_date', 100);
                    const ev = (bookings || []).find(b =>
                        (b.customer_name || '').includes(cmd.name) &&
                        !['cancelled', 'completed'].includes(b.status || '')
                    );
                    if (!ev) return { ok: false, message: `אירוע של ${cmd.name} לא נמצא` };
                    let patch = {}, msg = '';
                    if (cmd.intent === 'event_update_date') {
                        patch = { event_date: cmd.date };
                        msg = `תאריך אירוע ${ev.customer_name} → ${cmd.date}`;
                    } else if (cmd.intent === 'event_update_guests') {
                        patch = { guest_count: Number(cmd.guest_count) || ev.guest_count };
                        msg = `${ev.customer_name}: ${patch.guest_count} סועדים`;
                    } else if (cmd.intent === 'event_cancel') {
                        patch = { status: 'cancelled' };
                        msg = `אירוע של ${ev.customer_name} בוטל`;
                    } else if (cmd.intent === 'event_payment_received') {
                        const prevDeposit = Number(ev.deposit_amount_ils) || 0;
                        const added = Number(cmd.amount) || 0;
                        patch = {
                            deposit_amount_ils: prevDeposit + added,
                            payment_status: (prevDeposit + added) >= Number(ev.total_ils || 0) ? 'paid' : 'partial',
                        };
                        msg = `${ev.customer_name}: התקבל ${added}₪ (סה"כ ${patch.deposit_amount_ils}₪)`;
                    }
                    await base44.entities.EventBooking.update(ev.id, patch);
                    return { ok: true, message: `בוצע ✓ ${msg}` };
                } catch (e) { return { ok: false, message: 'שגיאה: ' + (e?.message || '') }; }
            }

            // ---------- Deliveries ----------
            case 'delivery_assign_courier': {
                try {
                    const deliveries = await base44.entities.Delivery.list('-createdAt', 50);
                    const d = (deliveries || []).find(d =>
                        (d.customer_name || '').includes(cmd.name || '') &&
                        d.delivery_status !== 'delivered'
                    );
                    if (!d) return { ok: false, message: `משלוח של ${cmd.name} לא נמצא` };
                    await base44.entities.Delivery.update(d.id, { courier_name: cmd.courier });
                    return { ok: true, message: `בוצע ✓ ${cmd.courier} שובץ למשלוח של ${d.customer_name}` };
                } catch (e) { return { ok: false, message: 'שגיאה: ' + (e?.message || '') }; }
            }
            case 'delivery_mark_delivered': {
                try {
                    const deliveries = await base44.entities.Delivery.list('-createdAt', 50);
                    const d = (deliveries || []).find(dl =>
                        (dl.customer_name || '').includes(cmd.name || '') &&
                        dl.delivery_status !== 'delivered'
                    );
                    if (!d) return { ok: false, message: `משלוח של ${cmd.name} לא נמצא` };
                    await base44.entities.Delivery.update(d.id, {
                        delivery_status: 'delivered',
                        delivered_at: new Date().toISOString(),
                    });
                    return { ok: true, message: `בוצע ✓ משלוח של ${d.customer_name} סומן כנמסר` };
                } catch (e) { return { ok: false, message: 'שגיאה: ' + (e?.message || '') }; }
            }
            case 'q_pending_deliveries': {
                try {
                    const deliveries = await base44.entities.Delivery.list('-createdAt', 50);
                    const pending = (deliveries || []).filter(d => d.delivery_status === 'pending' || !d.courier_name);
                    if (pending.length === 0) return { ok: true, message: 'אין משלוחים ממתינים' };
                    const names = pending.slice(0, 5).map(d => d.customer_name || 'ללא שם').join(', ');
                    return { ok: true, message: `${pending.length} משלוחים ממתינים: ${names}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }

            // ---------- Inventory: SET / REMOVE ----------
            case 'inventory_set': {
                try {
                    const items = await base44.entities.Inventory.list();
                    const it = (items || []).find(i => (i.item_name || '').includes(cmd.item || ''));
                    if (!it) return { ok: false, message: `${cmd.item} לא במלאי` };
                    await base44.entities.Inventory.update(it.id, {
                        current_stock: Number(cmd.quantity) || 0,
                        last_updated: new Date().toISOString(),
                    });
                    return { ok: true, message: `בוצע ✓ ${it.item_name}: ${cmd.quantity} ${it.unit || ''}` };
                } catch (e) { return { ok: false, message: 'שגיאה: ' + (e?.message || '') }; }
            }
            case 'inventory_remove': {
                try {
                    const items = await base44.entities.Inventory.list();
                    const it = (items || []).find(i => (i.item_name || '').includes(cmd.item || ''));
                    if (!it) return { ok: false, message: `${cmd.item} לא במלאי` };
                    const newStock = Math.max(0, Number(it.current_stock || 0) - Number(cmd.quantity || 0));
                    await base44.entities.Inventory.update(it.id, {
                        current_stock: newStock,
                        last_updated: new Date().toISOString(),
                    });
                    return { ok: true, message: `בוצע ✓ ${it.item_name}: נשארו ${newStock} ${it.unit || ''}` };
                } catch (e) { return { ok: false, message: 'שגיאה: ' + (e?.message || '') }; }
            }
            case 'q_inventory_value': {
                try {
                    const items = await base44.entities.Inventory.list();
                    const total = (items || []).reduce((s, i) =>
                        s + (Number(i.current_stock || 0) * Number(i.cost_per_unit || 0)), 0);
                    return { ok: true, message: `שווי מלאי: ₪${Math.round(total)}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }

            // ---------- Customers ----------
            case 'customer_add': {
                try {
                    const phone = String(cmd.phone || '').replace(/[^\d]/g, '');
                    if (phone.length < 7) return { ok: false, message: 'טלפון לא תקין' };
                    const existing = await base44.entities.Customer.filter({ phone });
                    if (existing && existing.length > 0) {
                        return { ok: false, message: `${existing[0].name || 'לקוח'} כבר רשום עם הטלפון הזה` };
                    }
                    await base44.entities.Customer.create({
                        name: cmd.name,
                        phone,
                        loyalty_tier: 'regular',
                        visit_count: 0,
                    });
                    return { ok: true, message: `בוצע ✓ ${cmd.name} נוסף ללקוחות` };
                } catch (e) { return { ok: false, message: 'שגיאה: ' + (e?.message || '') }; }
            }
            case 'customer_update_phone': {
                try {
                    const customers = await base44.entities.Customer.list();
                    const c = (customers || []).find(c => (c.name || '').includes(cmd.name));
                    if (!c) return { ok: false, message: `${cmd.name} לא נמצא` };
                    const phone = String(cmd.phone || '').replace(/[^\d]/g, '');
                    if (phone.length < 7) return { ok: false, message: 'טלפון לא תקין' };
                    await base44.entities.Customer.update(c.id, { phone });
                    return { ok: true, message: `בוצע ✓ טלפון של ${c.name} עודכן` };
                } catch (e) { return { ok: false, message: 'שגיאה: ' + (e?.message || '') }; }
            }
            case 'q_customer_spend': {
                try {
                    const customers = await base44.entities.Customer.list();
                    const c = (customers || []).find(c => (c.name || '').includes(cmd.name));
                    if (!c) return { ok: false, message: `${cmd.name} לא נמצא` };
                    // Estimate from visit_count * average bill (220 default)
                    const estimated = (c.visit_count || 0) * 220;
                    return { ok: true, message: `${c.name}: ${c.visit_count || 0} ביקורים, ~₪${estimated}` };
                } catch { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
            }

            // ---------- Push to role (urgent broadcast) ----------
            case 'push_to_role': {
                try {
                    // Reuse sendTeamWhatsApp with role-filter prefix
                    const rolePrefix = cmd.role ? `[${cmd.role}] ` : '';
                    await base44.functions.sendTeamWhatsApp({
                        message: rolePrefix + (cmd.message || ''),
                        role: cmd.role,
                    });
                    return { ok: true, message: `בוצע ✓ הודעה נשלחה ל-${cmd.role || 'כל הצוות'}` };
                } catch { return { ok: false, message: 'שגיאה בשליחה' }; }
            }

            // ---------- Popups ----------
            case 'popup_disable': {
                try {
                    const popups = await base44.entities.Popup.list('-created_date', 50);
                    const target = (popups || []).find(p =>
                        p.is_active && (!cmd.title || (p.title || '').includes(cmd.title))
                    );
                    if (!target) return { ok: false, message: `אין פופאפ פעיל ${cmd.title ? 'בשם ' + cmd.title : ''}` };
                    await base44.entities.Popup.update(target.id, { is_active: false });
                    return { ok: true, message: `בוצע ✓ פופאפ "${target.title}" כובה` };
                } catch (e) { return { ok: false, message: 'שגיאה: ' + (e?.message || '') }; }
            }

            default:
                return { ok: false, message: 'פקודה לא מוכרת: ' + cmd.intent };
        }
    } catch (e) {
        console.error('[voice] dispatch failed', e);
        return { ok: false, message: 'שגיאה: ' + (e?.message || 'נסה שוב') };
    }
}
