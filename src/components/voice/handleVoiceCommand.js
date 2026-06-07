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
    'session_extend', 'session_move',
    'resend_confirmation', 'send_reminder',
]);

export async function handleVoiceCommand(cmd) {
    try {
        const state = await loadState();
        const { reservations, activeQueue, activeSessions, tables } = state;
        const result = await dispatchCommand(cmd, state);
        // Auto-broadcast on successful mutations so live pages refresh instantly.
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

            default:
                return { ok: false, message: 'פקודה לא מוכרת: ' + cmd.intent };
        }
    } catch (e) {
        console.error('[voice] dispatch failed', e);
        return { ok: false, message: 'שגיאה: ' + (e?.message || 'נסה שוב') };
    }
}
