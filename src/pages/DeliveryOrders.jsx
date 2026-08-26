import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Loader2, ClipboardList, RefreshCw, Bell, BellOff, Phone, MapPin, Search, ChevronDown } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';
import PageHeader, { PageShell } from '@/components/shared/PageHeader';

// Status → label + tone. WooCommerce native statuses, restaurant-friendly labels.
const STATUS = {
  pending:    { label: 'ממתין לתשלום', tone: 'muted' },
  processing: { label: 'חדשה — בהכנה', tone: 'work' },
  'on-hold':  { label: 'ממתינה',        tone: 'muted' },
  completed:  { label: 'הושלמה',        tone: 'ok' },
  cancelled:  { label: 'בוטלה',         tone: 'bad' },
  refunded:   { label: 'זוכתה',         tone: 'bad' },
  failed:     { label: 'נכשלה',         tone: 'bad' },
};
const TONE = {
  ok:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  work:  'bg-amber-100 text-amber-700 border-amber-200',
  bad:   'bg-rose-100 text-rose-700 border-rose-200',
  muted: 'bg-slate-100 text-slate-600 border-slate-200',
};
// Orders in these statuses are "live" — they should alert and sit at the top.
const ACTIVE = ['pending', 'processing', 'on-hold'];

const lsGet = (k, d) => { try { const v = localStorage.getItem('do_' + k); return v === null ? d : v; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem('do_' + k, v); } catch { /* ignore */ } };

function dateRange(key) {
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (x) => x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
  const d = new Date();
  if (key === 'today') return { from: fmt(d), to: fmt(d) };
  if (key === 'yesterday') { const y = new Date(d); y.setDate(d.getDate() - 1); return { from: fmt(y), to: fmt(y) }; }
  if (key === 'week') { const w = new Date(d); w.setDate(d.getDate() - 6); return { from: fmt(w), to: fmt(d) }; }
  if (key === 'month') { const m = new Date(d.getFullYear(), d.getMonth(), 1); return { from: fmt(m), to: fmt(d) }; }
  return {};
}

function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return 'עכשיו';
  const m = Math.floor(s / 60);
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.floor(m / 60);
  if (h < 24) return `לפני ${h} ש׳`;
  return `לפני ${Math.floor(h / 24)} ימים`;
}

export default function DeliveryOrders() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(true);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [soundOn, setSoundOn] = useState(() => lsGet('sound', '0') === '1');
  const [undo, setUndo] = useState(null); // {order, prevStatus, label}
  const [today, setToday] = useState(null); // {count, revenue, avg}
  const [busyId, setBusyId] = useState(null);
  const [flash, setFlash] = useState({});          // id → highlight new
  const [etaFor, setEtaFor] = useState(null);      // order id whose ETA picker is open
  const [openOverride, setOpenOverride] = useState({}); // id → explicit expand/collapse

  // Filters (server-side)
  const [statusF, setStatusF] = useState(() => lsGet('statusF', 'active'));
  const [dateF, setDateF] = useState(() => lsGet('dateF', 'all'));
  const [ratingF, setRatingF] = useState(() => lsGet('ratingF', ''));
  const [search, setSearch] = useState('');
  useEffect(() => { lsSet('statusF', statusF); }, [statusF]);
  useEffect(() => { lsSet('dateF', dateF); }, [dateF]);
  useEffect(() => { lsSet('ratingF', ratingF); }, [ratingF]);
  useEffect(() => { lsSet('sound', soundOn ? '1' : '0'); }, [soundOn]);

  const seenRef = useRef(null);   // Set of ids seen on a prior poll (null = first load)
  const audioRef = useRef(null);

  const beep = useCallback(() => {
    try {
      let ctx = audioRef.current;
      if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); audioRef.current = ctx; }
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;
      [0, 0.18].forEach((t) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = 880;
        o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, now + t);
        g.gain.exponentialRampToValueAtTime(0.35, now + t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.15);
        o.start(now + t); o.stop(now + t + 0.16);
      });
    } catch { /* audio not available */ }
  }, []);

  const load = useCallback(async (isPoll) => {
    if (!isPoll) setLoading(true);
    try {
      const dr = dateRange(dateF);
      const params = { limit: 80, status: statusF, rating: ratingF, search };
      if (dr.from) params.from = dr.from;
      if (dr.to) params.to = dr.to;
      const d = (await base44.functions.getDeliverySiteOrders(params))?.data || {};
      if (d.connected === false) { setConnected(false); return; }
      setConnected(true);
      const list = Array.isArray(d.orders) ? d.orders : [];
      // New-order detection: only while POLLING (never on a manual/filter reload,
      // where a changed result set would otherwise look like a flood of "new").
      const ids = new Set(list.map((o) => o.id));
      if (isPoll && seenRef.current) {
        const fresh = list.filter((o) => ACTIVE.includes(o.status) && !seenRef.current.has(o.id));
        if (fresh.length) {
          if (soundOn) beep();
          try {
            if ('Notification' in window && Notification.permission === 'granted') {
              const f0 = fresh[0];
              const extra = fresh.length > 1 ? ' (+' + (fresh.length - 1) + ')' : '';
              // eslint-disable-next-line no-new
              new Notification('🛵 הזמנה חדשה #' + f0.number + extra, { body: (f0.customer || '') + ' · ₪' + Number(f0.total).toLocaleString(), tag: 'do-new' });
            }
          } catch { /* notifications unavailable */ }
          const fl = {}; fresh.forEach((o) => { fl[o.id] = true; });
          setFlash((x) => ({ ...x, ...fl }));
          setTimeout(() => setFlash((x) => { const n = { ...x }; fresh.forEach((o) => delete n[o.id]); return n; }), 8000);
        }
      }
      seenRef.current = ids;
      setOrders(list);
      setUpdatedAt(new Date());
      setError('');
      // Today's totals for the KPI strip (fire-and-forget).
      base44.functions.getDeliverySiteOrdersToday({}).then((r) => { const dd = r?.data; if (dd?.ok) setToday(dd); }).catch(() => {});
    } catch (e) {
      setError(e?.message || 'טעינת ההזמנות נכשלה');
    } finally {
      setLoading(false);
    }
  }, [soundOn, beep, statusF, dateF, ratingF, search]);

  useEffect(() => { load(false); }, [load]);
  // Poll every 20s while the page is open.
  useEffect(() => {
    const t = setInterval(() => load(true), 20000);
    return () => clearInterval(t);
  }, [load]);
  // Tick every 15s so the countdown clocks stay live between polls.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, []);
  // Tab-title badge — active/overdue count is visible even when the tab is backgrounded.
  useEffect(() => {
    const orig = document.title;
    return () => { document.title = orig; };
  }, []);
  useEffect(() => {
    const now = Date.now() / 1000;
    const active = orders.filter((o) => ACTIVE.includes(o.status)).length;
    const over = orders.filter((o) => o.status === 'processing' && o.ready_at > 0 && o.ready_at < now).length;
    document.title = active > 0 ? `${over > 0 ? '🔴' : '⚡'} (${active}) הזמנות` : 'הזמנות משלוחים';
  }, [orders]);

  const updateOrder = async (o, payload) => {
    const prevStatus = o.status;
    setBusyId(o.id); setError('');
    try {
      const d = (await base44.functions.setDeliverySiteOrderStatus({ id: o.id, ...payload }))?.data || {};
      if (d.ok) {
        setOrders((os) => os.map((x) => (x.id === o.id ? { ...x, status: d.status, status_label: d.status_label, prep_minutes: d.prep_minutes, ready_at: d.ready_at, notified: payload.status === 'completed' ? true : x.notified } : x)));
        // Undo affordance for the destructive-ish transitions.
        if (payload.status === 'completed' || payload.status === 'cancelled') {
          const label = payload.status === 'completed' ? 'סומנה ✓' : 'בוטלה';
          setUndo({ id: o.id, order: { ...o }, prevStatus, label });
          setTimeout(() => setUndo((u) => (u && u.id === o.id ? null : u)), 6000);
        }
      } else setError(d.error || 'הפעולה נכשלה');
    } catch (e) {
      setError(e?.message || 'הפעולה נכשלה');
    } finally {
      setBusyId(null); setEtaFor(null);
    }
  };
  const doUndo = () => { if (undo) { const u = undo; setUndo(null); updateOrder(u.order, { status: u.prevStatus }); } };
  // Print-friendly kitchen bon.
  const printBon = (o) => {
    try {
      const w = window.open('', '_blank', 'width=380,height=640');
      if (!w) return;
      const items = (o.items || []).map((it) => `<div style="margin:7px 0"><b>${it.qty}× ${it.name}</b>${(it.meta || []).length ? `<div style="font-size:12px;color:#555">${it.meta.join(' · ')}</div>` : ''}</div>`).join('');
      w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>בון #${o.number}</title></head>
      <body style="font-family:Arial,sans-serif;padding:14px;max-width:320px">
        <div style="font-size:20px;font-weight:800">#${o.number} · ${o.fulfillment === 'pickup' ? '🥡 איסוף עצמי' : '🛵 משלוח'}</div>
        <div style="color:#555;margin:4px 0">${o.customer || ''} ${o.phone || ''}</div>
        ${o.address ? `<div>📍 ${o.address}</div>` : ''}
        ${o.note ? `<div style="background:#fff7e6;padding:6px;border-radius:6px;margin:6px 0">📝 ${o.note}</div>` : ''}
        <hr>${items}<hr>
        <div style="font-size:18px;font-weight:800">סה"כ ₪${Number(o.total).toLocaleString()}</div>
        <scr` + `ipt>window.onload=function(){window.print();}</scr` + `ipt>
      </body></html>`);
      w.document.close();
    } catch { /* popup blocked */ }
  };
  const ETA_OPTIONS = [15, 20, 30, 45, 60, 90];
  const readyText = (o) => {
    if (!o.ready_at) return '';
    const left = Math.ceil((o.ready_at - Date.now() / 1000) / 60);
    const hhmm = new Date(o.ready_at * 1000).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    return left > 0 ? `מוכן ~${hhmm} · עוד ${left} דק׳` : `אמור להיות מוכן (${hhmm})`;
  };

  const enableSound = (v) => {
    setSoundOn(v);
    if (v) {
      beep(); // unlock audio + confirm it works, on the enabling gesture
      try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch { /* ignore */ }
    }
  };

  // Smart sort: new orders that need accepting first, then overdue (most first),
  // then soonest-ready, then processing-without-a-time, then everything else.
  const _now = Date.now() / 1000;
  const rank = (o) => {
    if (o.status === 'pending' || o.status === 'on-hold') return 0;
    if (o.status === 'processing') return o.ready_at > 0 ? 1 + (o.ready_at - _now) / 1e9 : 2;
    return 3;
  };
  const shown = [...orders].sort((a, b) => rank(a) - rank(b) || (b.created - a.created));
  const activeCount = orders.filter((o) => ACTIVE.includes(o.status)).length;
  const overdueCount = orders.filter((o) => o.status === 'processing' && o.ready_at > 0 && o.ready_at < _now).length;
  const prepCount = orders.filter((o) => o.status === 'processing').length;
  const _prepVals = orders.filter((o) => o.prep_minutes > 0).map((o) => o.prep_minutes);
  const avgPrep = _prepVals.length ? Math.round(_prepVals.reduce((a, b) => a + b, 0) / _prepVals.length) : 0;

  const STATUS_TABS = [
    { k: 'active', label: 'פעילות' },
    { k: 'processing', label: 'בהכנה' },
    { k: 'completed', label: 'הושלמו' },
    { k: 'cancelled', label: 'בוטלו' },
    { k: 'all', label: 'הכל' },
  ];
  const DATE_TABS = [
    { k: 'today', label: 'היום' },
    { k: 'yesterday', label: 'אתמול' },
    { k: 'week', label: '7 ימים' },
    { k: 'month', label: 'החודש' },
    { k: 'all', label: 'הכל' },
  ];
  const RATING_TABS = [
    { k: '', label: 'הכל' },
    { k: 'rated', label: '⭐ מדורגות' },
    { k: 'low', label: 'דירוג נמוך' },
  ];
  const chip = (active) => `text-sm font-semibold px-3 py-1.5 rounded-full whitespace-nowrap ${active ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`;
  // Accordion: active orders open by default, completed/cancelled collapsed; the
  // owner can override per card.
  const isOpen = (o) => (openOverride[o.id] !== undefined ? openOverride[o.id] : ACTIVE.includes(o.status));
  const toggleOpen = (o) => setOpenOverride((x) => ({ ...x, [o.id]: !isOpen(o) }));
  const itemCount = (o) => (o.items || []).reduce((n, it) => n + (Number(it.qty) || 1), 0);
  // Wolt-style urgency clock: green in time → orange within 5 min → red overdue.
  const urgency = (o) => {
    if (o.status !== 'processing') return null;
    if (!o.ready_at) return { label: 'טרם נקבע זמן הכנה', cls: 'bg-slate-100 text-slate-600 border-slate-200' };
    const m = Math.ceil((o.ready_at - Date.now() / 1000) / 60);
    const hhmm = new Date(o.ready_at * 1000).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    if (m < 0) return { label: `⏰ באיחור ${Math.abs(m)} דק׳ · יעד ${hhmm}`, cls: 'bg-rose-100 text-rose-700 border-rose-300', pulse: true };
    if (m <= 5) return { label: `⏱ עוד ${m} דק׳ · מוכן ${hhmm}`, cls: 'bg-orange-100 text-orange-700 border-orange-300' };
    return { label: `⏱ עוד ${m} דק׳ · מוכן ${hhmm}`, cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  };

  return (
    <PageGuard pageName="DeliveryOrders" pageTitle="הזמנות משלוחים">
      <PageShell>
        <PageHeader
          title="הזמנות אתר משלוחים"
          subtitle="הזמנות נכנסות בזמן אמת — קבלה, הכנה וסגירה, ישירות מכאן"
          icon={ClipboardList}
          action={(
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 hidden sm:inline">{updatedAt ? 'עודכן ' + updatedAt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
              <Button variant="outline" size="sm" onClick={() => load(false)} disabled={loading}>
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          )}
        />

        {!connected ? (
          <Card className="max-w-lg mx-auto"><CardContent className="p-6 text-center" dir="rtl">
            <p className="text-slate-600">אתר המשלוחים לא מחובר. חברו אותו קודם בעמוד "אתר משלוחים".</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-4 max-w-2xl mx-auto" dir="rtl">

            {/* KPI strip */}
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center">
                <div className="text-2xl font-extrabold text-slate-800 leading-none">{activeCount}</div>
                <div className="text-[11px] text-slate-500 mt-1">פעילות</div>
              </div>
              <div className={`rounded-xl border p-2.5 text-center ${overdueCount > 0 ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'}`}>
                <div className={`text-2xl font-extrabold leading-none ${overdueCount > 0 ? 'text-rose-600' : 'text-slate-800'}`}>{overdueCount}</div>
                <div className="text-[11px] text-slate-500 mt-1">מאחרות</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center">
                <div className="text-2xl font-extrabold leading-none" style={{ color: '#b8442e' }}>₪{today ? Number(today.revenue).toLocaleString() : '–'}</div>
                <div className="text-[11px] text-slate-500 mt-1">מחזור היום</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center">
                <div className="text-2xl font-extrabold text-slate-800 leading-none">{avgPrep || '–'}<span className="text-sm">׳</span></div>
                <div className="text-[11px] text-slate-500 mt-1">זמן הכנה ממ׳</div>
              </div>
            </div>

            {/* Controls */}
            <Card>
              <CardContent className="p-3 space-y-2.5">
                {/* Search + sound */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute top-2.5 right-3 text-slate-400" />
                    <Input className="pr-9 h-9" placeholder="חיפוש: מס׳ הזמנה / שם / טלפון" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {soundOn ? <Bell className="w-4 h-4 text-emerald-600" /> : <BellOff className="w-4 h-4 text-slate-400" />}
                    <Switch checked={soundOn} onCheckedChange={enableSound} />
                  </div>
                </div>
                {/* Status */}
                <div className="flex items-center gap-1 bg-slate-100 rounded-full p-1 overflow-x-auto">
                  {STATUS_TABS.map((t) => (
                    <button key={t.k} onClick={() => setStatusF(t.k)} className={chip(statusF === t.k)}>
                      {t.label}
                      {t.k === 'active' && activeCount > 0 && <span className="mr-1 inline-flex items-center justify-center bg-amber-500 text-white text-[11px] rounded-full w-5 h-5">{activeCount}</span>}
                    </button>
                  ))}
                </div>
                {/* Date + rating */}
                <div className="flex items-center gap-1 bg-slate-100 rounded-full p-1 overflow-x-auto">
                  {DATE_TABS.map((t) => (
                    <button key={t.k} onClick={() => setDateF(t.k)} className={chip(dateF === t.k)}>{t.label}</button>
                  ))}
                </div>
                <div className="flex items-center gap-1 bg-slate-100 rounded-full p-1 w-fit">
                  {RATING_TABS.map((t) => (
                    <button key={t.k} onClick={() => setRatingF(t.k)} className={chip(ratingF === t.k)}>{t.label}</button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {error && <p className="text-sm font-semibold text-rose-600 text-center">{error}</p>}

            {loading && orders.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin ml-2" /> טוען הזמנות…</div>
            ) : shown.length === 0 ? (
              <Card><CardContent className="p-10 text-center text-slate-500" dir="rtl">
                <div className="text-4xl mb-2">🎉</div>
                <p className="font-semibold">{statusF === 'active' ? 'אין הזמנות פעילות כרגע' : 'אין הזמנות שתואמות לסינון'}</p>
                <p className="text-sm text-slate-400 mt-1">הזמנות חדשות יופיעו כאן אוטומטית.</p>
              </CardContent></Card>
            ) : (
              shown.map((o) => {
                const st = STATUS[o.status] || { label: o.status_label || o.status, tone: 'muted' };
                const isDelivery = o.fulfillment !== 'pickup';
                const open = isOpen(o);
                const urg = urgency(o);
                const active = ACTIVE.includes(o.status);
                return (
                  <Card key={o.id} className={`overflow-hidden transition ${flash[o.id] ? 'ring-2 ring-amber-400 shadow-lg' : urg?.pulse ? 'ring-2 ring-rose-300' : ''}`}>
                    <CardContent className="p-0">
                      {/* Header — tap to expand/collapse */}
                      <div className="flex items-start justify-between gap-2 p-3.5 cursor-pointer select-none" onClick={() => toggleOpen(o)}>
                        <div className="flex items-start gap-2 min-w-0">
                          <ChevronDown className={`w-4 h-4 mt-1 text-slate-400 flex-shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-extrabold text-slate-800" dir="ltr">#{o.number}</span>
                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${TONE[st.tone]}`}>{st.label}</span>
                              {flash[o.id] && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white animate-pulse" style={{ background: '#b8442e' }}>חדש!</span>}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5 truncate">
                              {timeAgo(o.created)} · {isDelivery ? '🛵 משלוח' : '🥡 איסוף'} · {itemCount(o)} מנות{o.customer ? ' · ' + o.customer : ''}
                            </div>
                          </div>
                        </div>
                        <div className="text-lg font-extrabold whitespace-nowrap" style={{ color: '#b8442e' }}>₪{Number(o.total).toLocaleString()}</div>
                      </div>

                      {/* Urgency clock — always visible for in-prep orders */}
                      {urg && (
                        <div className={`mx-3.5 mb-2 flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm font-bold ${urg.cls} ${urg.pulse ? 'animate-pulse' : ''}`}>
                          <span>{urg.label}</span>
                          {o.status === 'processing' && o.ready_at > 0 && etaFor !== o.id && (
                            <button className="text-xs underline opacity-80" onClick={(e) => { e.stopPropagation(); setEtaFor(o.id); }}>שנה</button>
                          )}
                        </div>
                      )}

                      {/* Phone — always accessible */}
                      {o.phone && (
                        <div className="px-3.5 pb-1">
                          <a href={`tel:${o.phone}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-sky-600 font-semibold text-sm" dir="ltr"><Phone className="w-3.5 h-3.5" />{o.phone}</a>
                        </div>
                      )}

                      {/* Quick actions — always visible for active orders, no need to expand */}
                      {active && (
                        etaFor === o.id ? (
                          <div className="m-3.5 border border-amber-200 bg-amber-50 rounded-xl p-3 space-y-2">
                            <div className="text-sm font-semibold text-amber-800">כמה זמן הכנה? {isDelivery ? '(כולל משלוח)' : '(לאיסוף)'}</div>
                            <div className="grid grid-cols-3 gap-2">
                              {ETA_OPTIONS.map((m) => (
                                <button key={m} onClick={() => updateOrder(o, { prep_minutes: m, status: o.status === 'processing' ? undefined : 'processing' })}
                                  disabled={busyId === o.id}
                                  className="py-2 rounded-lg border border-amber-300 bg-white font-bold text-amber-800 hover:bg-amber-100">{m} דק׳</button>
                              ))}
                            </div>
                            <button className="text-xs text-slate-500 underline" onClick={() => setEtaFor(null)}>ביטול</button>
                          </div>
                        ) : (
                          <div className="flex gap-2 px-3.5 pb-3 pt-1">
                            {(o.status === 'pending' || o.status === 'on-hold') && (
                              <Button size="sm" className="flex-1 text-white hover:opacity-90" style={{ background: '#b8442e' }} onClick={() => setEtaFor(o.id)} disabled={busyId === o.id}>
                                {busyId === o.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'קבל להכנה 👨‍🍳'}
                              </Button>
                            )}
                            {o.status === 'processing' && !o.ready_at && (
                              <Button size="sm" className="flex-1 bg-amber-500 hover:bg-amber-600" onClick={() => setEtaFor(o.id)} disabled={busyId === o.id}>⏱ הזן זמן הכנה</Button>
                            )}
                            {o.status === 'processing' && (
                              <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => updateOrder(o, { status: 'completed' })} disabled={busyId === o.id}>
                                {busyId === o.id ? <Loader2 className="w-4 h-4 animate-spin" /> : (isDelivery ? 'יצא למשלוח 📲' : 'מוכן לאיסוף 📲')}
                              </Button>
                            )}
                            <Button size="sm" variant="outline" className="text-rose-500 border-rose-200 px-3" onClick={() => updateOrder(o, { status: 'cancelled' })} disabled={busyId === o.id}>ביטול</Button>
                          </div>
                        )
                      )}

                      {/* Expanded details — items, address, note, rating */}
                      {open && (
                        <div className="px-3.5 pb-3.5 pt-2 space-y-2 border-t border-slate-100">
                          {isDelivery && o.address && (
                            <div className="flex items-start gap-1 text-sm text-slate-600"><MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /><span>{o.address}</span></div>
                          )}
                          {o.note && <div className="text-xs bg-amber-50 text-amber-800 rounded-lg p-2">📝 {o.note}</div>}
                          {o.rating > 0 && (
                            <div className="text-sm flex items-center gap-2 flex-wrap">
                              <span className="text-amber-500">{'★'.repeat(o.rating)}<span className="text-slate-300">{'★'.repeat(5 - o.rating)}</span></span>
                              {o.rating_comment && <span className="text-slate-500 text-xs">"{o.rating_comment}"</span>}
                            </div>
                          )}
                          <div className="space-y-1.5">
                            {(o.items || []).map((it, i) => (
                              <div key={i} className="text-sm">
                                <div className="font-semibold text-slate-800">{it.qty}× {it.name}</div>
                                {(it.meta || []).length > 0 && <div className="text-xs text-slate-500 pr-4">{it.meta.join(' · ')}</div>}
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <button onClick={() => printBon(o)} className="text-xs text-slate-500 underline">🖨 הדפס בון</button>
                            {o.status === 'completed' && <span className="text-sm text-emerald-600 font-semibold">✓ הושלמה{o.notified ? ' · 📲 הלקוח עודכן' : ''}</span>}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}

            {undo && (
              <div className="fixed bottom-4 inset-x-4 max-w-md mx-auto bg-slate-800 text-white rounded-xl px-4 py-3 flex items-center justify-between shadow-2xl z-50" dir="rtl">
                <span className="text-sm font-semibold">#{undo.order.number} {undo.label}</span>
                <button onClick={doUndo} className="text-sm font-extrabold underline" style={{ color: '#f0a58c' }}>בטל ↩</button>
              </div>
            )}
          </div>
        )}
      </PageShell>
    </PageGuard>
  );
}
