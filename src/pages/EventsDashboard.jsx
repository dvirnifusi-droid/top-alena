// Events overview — KPIs + monthly Gantt + per-event status with vendor chips.
// Embedded as the first tab of /EventsHub and reachable directly via the URL.
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, RefreshCw, Calendar, TrendingUp, CheckCircle2 } from 'lucide-react';

const STATUS_LABEL = {
    pending: '⏳ ממתין',
    confirmed: '✅ אושר',
    contract_sent: '📨 חוזה נשלח',
    contract_signed: '✍️ חוזה חתום',
    deposit_paid: '💳 פיקדון התקבל',
    completed: '🏁 הושלם',
    cancelled: '❌ בוטל',
};
const STATUS_COLOR = {
    pending: 'bg-gray-200 text-gray-700',
    confirmed: 'bg-blue-100 text-blue-800',
    contract_sent: 'bg-amber-100 text-amber-800',
    contract_signed: 'bg-emerald-100 text-emerald-800',
    deposit_paid: 'bg-emerald-200 text-emerald-900',
    completed: 'bg-gray-300 text-gray-700',
    cancelled: 'bg-red-100 text-red-700',
};

const HE_MONTHS = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני', 'יולי', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
const monthLabel = (ym) => {
    const [y, m] = ym.split('-');
    return `${HE_MONTHS[parseInt(m) - 1]} ${y}`;
};

export default function EventsDashboard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const r = await base44.functions.eventsDashboard({});
            setData(r?.data ?? r);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    if (loading) return <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-300" /></div>;
    if (!data) return <div className="p-6 text-center text-gray-400">אין נתונים</div>;

    const s = data.stats || {};

    return (
        <div className="p-2 md:p-4" dir="rtl">
            {/* === KPI cards === */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 md:gap-3 mb-4">
                <Kpi label="🟢 אירועים פתוחים" value={s.total_open} color="text-blue-700" />
                <Kpi label="✅ סגורים בטווח" value={s.total_closed} color="text-gray-700" />
                <Kpi label="💼 הכנסות צפויות" value={`₪${(s.revenue_pipeline_open || 0).toLocaleString()}`} color="text-[#A04A2E]" />
                <Kpi label="🎯 הכנסות שמומשו" value={`₪${(s.revenue_realized_closed || 0).toLocaleString()}`} color="text-emerald-700" />
                <Kpi label="⏳ עמלות לתשלום" value={`₪${(s.commissions_due || 0).toLocaleString()}`} color="text-amber-700" />
                <Kpi label="✅ עמלות שולמו" value={`₪${(s.commissions_paid || 0).toLocaleString()}`} color="text-emerald-700" />
            </div>

            {/* === Monthly Gantt — count + revenue per month === */}
            <Card className="mb-4">
                <CardContent className="p-3 md:p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-sm flex items-center gap-1">
                            <Calendar className="w-4 h-4 text-[#A04A2E]" /> גאנט אירועים — לפי חודש
                        </h3>
                        <button onClick={load} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                            <RefreshCw className="w-3 h-3" /> רענן
                        </button>
                    </div>
                    {(data.monthly || []).length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-4">אין אירועים בטווח התאריכים</p>
                    ) : (
                        <GanttChart monthly={data.monthly} events={data.events || []} />
                    )}
                </CardContent>
            </Card>

            {/* === Open events table — sorted by date === */}
            <Card>
                <CardContent className="p-3 md:p-4">
                    <h3 className="font-bold text-sm mb-2 flex items-center gap-1">
                        <TrendingUp className="w-4 h-4 text-emerald-600" /> אירועים פתוחים — סטטוס וספקים
                    </h3>
                    {(data.open || []).length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-6">אין אירועים פתוחים כרגע</p>
                    ) : (
                        <div className="space-y-2">
                            {data.open.map(e => <EventRow key={e.id} e={e} />)}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* === Closed events (recent) === */}
            {(data.closed || []).length > 0 && (
                <Card className="mt-3">
                    <CardContent className="p-3 md:p-4">
                        <h3 className="font-bold text-sm mb-2 flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4 text-gray-500" /> אירועים סגורים ({data.closed.length})
                        </h3>
                        <div className="space-y-2">
                            {data.closed.slice(0, 20).map(e => <EventRow key={e.id} e={e} closed />)}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function Kpi({ label, value, color }) {
    return (
        <Card><CardContent className="p-3 text-center">
            <div className={`text-xl md:text-2xl font-black ${color}`}>{value ?? 0}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
        </CardContent></Card>
    );
}

// Horizontal monthly bars — each month gets a bar with open + closed counts,
// stacked, scaled to the busiest month.
function GanttChart({ monthly, events }) {
    const maxCount = Math.max(1, ...monthly.map(m => m.open + m.closed));
    return (
        <div className="overflow-x-auto">
            <div className="flex gap-2 min-w-max pb-2">
                {monthly.map(m => {
                    const total = m.open + m.closed;
                    const openPct = total > 0 ? (m.open / total) * 100 : 0;
                    const monthEvents = events.filter(e => String(e.event_date || '').startsWith(m.key));
                    return (
                        <div key={m.key} className="min-w-[160px] border rounded-lg p-2 bg-white">
                            <div className="text-xs font-bold text-gray-700 mb-1">{monthLabel(m.key)}</div>
                            <div className="text-[10px] text-gray-500 mb-1">
                                {m.open} פתוחים · {m.closed} סגורים · ₪{m.revenue.toLocaleString()}
                            </div>
                            {/* Stacked bar */}
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex" title={`${total} אירועים`}>
                                <div className="bg-blue-500" style={{ width: `${openPct}%` }} />
                                <div className="bg-gray-400 flex-1" />
                            </div>
                            {/* Per-event chips */}
                            <div className="space-y-1 mt-2 max-h-44 overflow-y-auto">
                                {monthEvents.map(e => (
                                    <div key={e.id}
                                        className={`px-2 py-1 rounded text-[10px] truncate ${e.is_closed ? 'bg-gray-100 text-gray-600' : 'bg-blue-50 text-blue-900'}`}
                                        title={`${e.customer_name || ''} · ${e.guest_count || 0} סועדים · ₪${(e.total_ils || 0).toLocaleString()}`}>
                                        {String(e.event_date || '').slice(8, 10)}: {(e.customer_name || '—').slice(0, 14)}
                                        {e.guest_count ? <span className="text-gray-500"> · {e.guest_count}</span> : null}
                                    </div>
                                ))}
                                {monthEvents.length === 0 && <div className="text-[10px] text-gray-300 italic">אין</div>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function EventRow({ e, closed }) {
    const status = String(e.status || 'pending').toLowerCase();
    const label = STATUS_LABEL[status] || status;
    const color = STATUS_COLOR[status] || 'bg-gray-100 text-gray-700';
    const referrer = (e.vendor_links || []).find(l => l.role === 'referrer');
    const services = (e.vendor_links || []).filter(l => l.role === 'service');
    return (
        <div className={`p-3 rounded-lg border ${closed ? 'bg-gray-50/60' : 'bg-white'}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm">{e.customer_name || '—'}</span>
                        <span className="text-xs text-gray-500">{String(e.event_date || '').slice(0, 10)}</span>
                        {e.guest_count ? <span className="text-xs text-gray-500">· {e.guest_count} סועדים</span> : null}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${color}`}>{label}</span>
                    </div>
                    {(referrer || services.length > 0) && (
                        <div className="text-[10px] mt-1.5 flex flex-wrap gap-1.5">
                            {referrer && (
                                <span className="bg-[#F4ECD8] text-[#7A3722] font-bold px-2 py-0.5 rounded-full">
                                    🎯 {referrer.vendor?.business_name || '—'}
                                </span>
                            )}
                            {services.map(l => (
                                <span key={l.id} className="bg-purple-50 text-purple-800 px-2 py-0.5 rounded-full">
                                    🛠️ {l.vendor?.business_name || '—'}{l.service_type ? ` · ${l.service_type}` : ''}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                <div className="text-left text-xs">
                    {e.total_ils ? <div className="font-black text-base">₪{Number(e.total_ils).toLocaleString()}</div> : null}
                    {e.deposit_amount_ils ? <div className="text-gray-500">פיקדון ₪{Number(e.deposit_amount_ils).toLocaleString()}</div> : null}
                </div>
            </div>
        </div>
    );
}
