// Global voice command dispatcher — works from ANY page.
// All operations go through base44 entities (server-backed), no client state needed.
import { base44 } from '@/api/base44Client';

const { Reservation, QueueEntry, TableSession, SeatingLayout } = base44.entities;

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

export async function handleVoiceCommand(cmd) {
    try {
        const state = await loadState();
        const { reservations, activeQueue, activeSessions, tables } = state;

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
                    return { ok: true, message: `שולחן ${cmd.table} סומן כפנוי` };
                }
                if (!r) return { ok: false, message: `אין הזמנה פעילה על שולחן ${cmd.table}` };
                await Reservation.update(r.id, { status: newStatus });
                const fb = newStatus === 'seated' ? 'יושב' : newStatus === 'finishing_soon' ? 'סיום קרוב' : 'no-show';
                return { ok: true, message: `שולחן ${cmd.table} ${fb}` };
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
                    message: `שולחן ${cmd.table} ${cmd.flag ? 'דגל ' + (FLAG_NAMES[cmd.flag] || cmd.flag) : 'ללא דגל'}`,
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
                return { ok: true, message: `${cmd.name}, ${cmd.party_size} איש, נוספו לתור` };
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
                    return { ok: true, message: `קראתי ל-${cmd.name}` };
                } catch { return { ok: false, message: 'שגיאה בקריאה' }; }
            }
            case 'queue_arrived': {
                const entry = activeQueue.find(q => (q.customer_name || '').includes(cmd.name) && q.status === 'pending');
                if (!entry) return { ok: false, message: `${cmd.name} לא בתור` };
                await QueueEntry.update(entry.id, {
                    status: 'active',
                    timestamp_approved: new Date().toISOString(),
                });
                return { ok: true, message: `${cmd.name} אושרה` };
            }
            case 'queue_abandoned': {
                const entry = activeQueue.find(q => (q.customer_name || '').includes(cmd.name));
                if (!entry) return { ok: false, message: `${cmd.name} לא נמצא` };
                await QueueEntry.update(entry.id, {
                    status: 'abandoned',
                    timestamp_end: new Date().toISOString(),
                });
                return { ok: true, message: `${cmd.name} נטוש` };
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
                return { ok: true, message: `${cmd.name} ישוב על ${tableIds.join(' ו-')}` };
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
                return { ok: true, message: `${next.customer_name} ישוב על שולחן ${cmd.table}` };
            }

            // ---------- Communication ----------
            case 'resend_confirmation': {
                const r = reservations.find(r =>
                    (r.customer_name || '').includes(cmd.name) && (r.status || 'pending') === 'confirmed'
                );
                if (!r) return { ok: false, message: `${cmd.name} לא נמצא` };
                return { ok: true, message: `נשלח אישור ל-${cmd.name}` };
            }

            default:
                return { ok: false, message: 'פקודה לא מוכרת' };
        }
    } catch (e) {
        console.error('[voice] handler failed', e);
        return { ok: false, message: 'שגיאה: ' + (e?.message || 'נסה שוב') };
    }
}
