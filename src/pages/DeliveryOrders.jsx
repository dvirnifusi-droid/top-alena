import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ClipboardList, RefreshCw, Bell, BellOff, Phone, MapPin, Search, ChevronDown, List, LayoutGrid, Monitor, BarChart3 } from 'lucide-react';
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
  const [viewMode, setViewMode] = useState(() => lsGet('view', 'list')); // list | board | wall
  useEffect(() => { lsSet('view', viewMode); }, [viewMode]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkPick, setBulkPick] = useState(false); // rush-hour "accept all" ETA picker open
  const [report, setReport] = useState(null); // null | 'loading' | { text, stats }
  const [reportSent, setReportSent] = useState('');

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
    const over = orders.filter((o) => o.status === 'processing' && o.ready_at > 0 && o.ready_at < now && (!o.created || now - o.created <= 14400)).length;
    document.title = active > 0 ? `${over > 0 ? '🔴' : '⚡'} (${active}) הזמנות` : 'הזמנות משלוחים';
  }, [orders]);

  const updateOrder = async (o, payload) => {
    // Optimistic: the card reacts INSTANTLY; the server round-trip (app → WP → WC)
    // happens in the background and we reconcile with its authoritative values,
    // or roll back if it fails. No more waiting a full round-trip per click.
    const prev = { status: o.status, status_label: o.status_label, prep_minutes: o.prep_minutes, ready_at: o.ready_at, notified: o.notified };
    const opt = {};
    if (payload.prep_minutes != null) {
      opt.prep_minutes = payload.prep_minutes;
      opt.ready_at = payload.prep_minutes > 0 ? Math.floor(Date.now() / 1000) + payload.prep_minutes * 60 : 0;
      if (!payload.status && o.status !== 'processing') opt.status = 'processing';
    }
    if (payload.status) { opt.status = payload.status; opt.status_label = (STATUS[payload.status] || {}).label || payload.status; }
    if (payload.status === 'completed') opt.notified = true;
    setError('');
    setEtaFor(null);
    setOrders((os) => os.map((x) => (x.id === o.id ? { ...x, ...opt } : x)));
    // Undo affordance appears immediately for the destructive-ish transitions.
    if (payload.status === 'completed' || payload.status === 'cancelled') {
      const label = payload.status === 'completed' ? 'סומנה ✓' : 'בוטלה';
      setUndo({ id: o.id, order: { ...o }, prevStatus: prev.status, label });
      setTimeout(() => setUndo((u) => (u && u.id === o.id ? null : u)), 6000);
    }
    setBusyId(o.id);
    try {
      const d = (await base44.functions.setDeliverySiteOrderStatus({ id: o.id, ...payload }))?.data || {};
      if (d.ok) {
        // Reconcile with the server's authoritative values.
        setOrders((os) => os.map((x) => (x.id === o.id ? { ...x, status: d.status, status_label: d.status_label, prep_minutes: d.prep_minutes, ready_at: d.ready_at } : x)));
      } else {
        setOrders((os) => os.map((x) => (x.id === o.id ? { ...x, ...prev } : x)));
        setUndo((u) => (u && u.id === o.id ? null : u));
        setError(d.error || 'הפעולה נכשלה');
      }
    } catch (e) {
      setOrders((os) => os.map((x) => (x.id === o.id ? { ...x, ...prev } : x)));
      setUndo((u) => (u && u.id === o.id ? null : u));
      setError(e?.message || 'הפעולה נכשלה');
    } finally {
      setBusyId(null);
    }
  };
  const doUndo = () => { if (undo) { const u = undo; setUndo(null); updateOrder(u.order, { status: u.prevStatus }); } };

  // End-of-day report — preview in-app, then send to the owner's WhatsApp.
  const openReport = async () => {
    setReport('loading'); setReportSent('');
    try {
      const d = (await base44.functions.previewDeliveryDailyReport({}))?.data || {};
      if (d.connected === false) { setReport({ text: 'אתר המשלוחים לא מחובר.', stats: null }); return; }
      setReport({ text: d.text || '', stats: d.stats || null });
    } catch { setReport({ text: 'טעינת הסיכום נכשלה', stats: null }); }
  };
  const sendReport = async () => {
    setReportSent('sending');
    try {
      const d = (await base44.functions.sendDeliveryDailyReportNow({}))?.data || {};
      setReportSent(d.ok ? `נשלח ל-${d.sent} מספרים ✓` : (d.error === 'no_recipient' ? 'לא מוגדר נמען לדוחות' : d.error === 'not_connected' ? 'האתר לא מחובר' : 'השליחה נכשלה'));
    } catch { setReportSent('השליחה נכשלה'); }
  };

  // Rush hour: accept every pending order at once with one prep time (one HTTP call).
  const bulkAccept = async (minutes) => {
    const ids = orders.filter((o) => o.status === 'pending' || o.status === 'on-hold').map((o) => o.id);
    setBulkPick(false);
    if (!ids.length) return;
    const readyAt = minutes > 0 ? Math.floor(Date.now() / 1000) + minutes * 60 : 0;
    setBulkBusy(true); setError('');
    const revert = new Map(orders.filter((o) => ids.includes(o.id)).map((o) => [o.id, { status: o.status, status_label: o.status_label, prep_minutes: o.prep_minutes, ready_at: o.ready_at }]));
    setOrders((os) => os.map((x) => (ids.includes(x.id) ? { ...x, status: 'processing', status_label: (STATUS.processing || {}).label, prep_minutes: minutes, ready_at: readyAt } : x)));
    try {
      const d = (await base44.functions.bulkSetDeliverySiteOrderStatus({ ids, status: 'processing', prep_minutes: minutes }))?.data || {};
      if (d.ok && Array.isArray(d.updated)) {
        const map = Object.fromEntries(d.updated.map((u) => [u.id, u]));
        setOrders((os) => os.map((x) => (map[x.id] ? { ...x, status: map[x.id].status, status_label: map[x.id].status_label, prep_minutes: map[x.id].prep_minutes, ready_at: map[x.id].ready_at } : x)));
      } else {
        setOrders((os) => os.map((x) => (revert.has(x.id) ? { ...x, ...revert.get(x.id) } : x)));
        setError(d.error || 'קבלה בכמות נכשלה');
      }
    } catch (e) {
      setOrders((os) => os.map((x) => (revert.has(x.id) ? { ...x, ...revert.get(x.id) } : x)));
      setError(e?.message || 'קבלה בכמות נכשלה');
    } finally { setBulkBusy(false); }
  };
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
  // "Late" = actually behind on a fresh order; a days-old stuck order is "stale",
  // counted separately below, not screaming red in the KPI.
  const overdueCount = orders.filter((o) => o.status === 'processing' && o.ready_at > 0 && o.ready_at < _now && (!o.created || _now - o.created <= 14400)).length;
  const staleCount = orders.filter((o) => o.status === 'processing' && o.created && _now - o.created > 14400).length;
  const prepCount = orders.filter((o) => o.status === 'processing').length;
  const _prepVals = orders.filter((o) => o.prep_minutes > 0).map((o) => o.prep_minutes);
  const avgPrep = _prepVals.length ? Math.round(_prepVals.reduce((a, b) => a + b, 0) / _prepVals.length) : 0;
  // Prep-time accuracy: of completed orders that carried a promised "ready at",
  // how many were actually completed by then (2-min grace).
  const _acc = orders.filter((o) => o.status === 'completed' && o.ready_at > 0 && o.completed_at > 0);
  const _onTime = _acc.filter((o) => o.completed_at <= o.ready_at + 120).length;
  const onTimePct = _acc.length ? Math.round((_onTime / _acc.length) * 100) : null;

  // Returning-customer badge from the WP feed's customer_orders count.
  const vip = (o) => {
    const n = o.customer_orders || 0;
    if (n >= 10) return { label: `👑 VIP · ${n} הזמנות`, cls: 'text-white border-transparent', style: { background: 'linear-gradient(90deg,#f59e0b,#ea580c)' } };
    if (n >= 5) return { label: `⭐ לקוח קבוע · ${n}`, cls: 'bg-amber-100 text-amber-700 border-amber-200' };
    if (n >= 2) return { label: `↩ לקוח חוזר · ${n}`, cls: 'bg-sky-100 text-sky-700 border-sky-200' };
    return null;
  };

  const VIEW_TABS = [
    { k: 'list', label: 'רשימה', Icon: List },
    { k: 'board', label: 'לוח', Icon: LayoutGrid },
    { k: 'wall', label: 'קיר מטבח', Icon: Monitor },
  ];
  const boardCols = [
    { key: 'new', title: '🆕 חדשות', match: (o) => o.status === 'pending' || o.status === 'on-hold', accent: '#b8442e' },
    { key: 'prep', title: '👨‍🍳 בהכנה', match: (o) => o.status === 'processing', accent: '#d97706' },
    { key: 'done', title: '✅ מוכנות', match: (o) => o.status === 'completed', accent: '#059669' },
  ];

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
  // Accordion: active orders open by default, completed/cancelled collapsed; the
  // owner can override per card.
  const isOpen = (o) => (openOverride[o.id] !== undefined ? openOverride[o.id] : ACTIVE.includes(o.status));
  const toggleOpen = (o) => setOpenOverride((x) => ({ ...x, [o.id]: !isOpen(o) }));
  const itemCount = (o) => (o.items || []).reduce((n, it) => n + (Number(it.qty) || 1), 0);
  // Wolt-style urgency clock: green in time → orange within 5 min → red overdue.
  // Human duration: minutes under an hour, else "Xש׳ Yד׳" (so a stuck order
  // reads "24ש׳ 51ד׳", not a meaningless "1491 דק׳").
  const fmtDur = (mins) => {
    const t = Math.abs(Math.round(mins));
    if (t < 60) return `${t} דק׳`;
    const h = Math.floor(t / 60), r = t % 60;
    if (h >= 24) { const d = Math.floor(h / 24); return `${d} ימים`; }
    return r ? `${h}ש׳ ${r}ד׳` : `${h}ש׳`;
  };
  const urgency = (o) => {
    if (o.status !== 'processing') return null;
    // An order still "in prep" hours later is forgotten/abandoned, not "late by
    // 1491 min". Give it a calm gray "close it?" state instead of a red alarm.
    const ageMin = o.created ? Math.round(Date.now() / 1000 / 60 - o.created / 60) : 0;
    if (o.created && ageMin > 240) {
      return { tone: 'stale', label: `🕰 ישנה · לפני ${fmtDur(ageMin)} · לסגור?`, cls: 'bg-slate-100 text-slate-500 border-slate-200' };
    }
    if (!o.ready_at) return { tone: 'none', label: 'טרם נקבע זמן הכנה', cls: 'bg-slate-100 text-slate-600 border-slate-200' };
    const m = Math.ceil((o.ready_at - Date.now() / 1000) / 60);
    const hhmm = new Date(o.ready_at * 1000).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    if (m < 0) return { tone: 'late', label: `⏰ באיחור ${fmtDur(m)} · יעד ${hhmm}`, cls: 'bg-rose-100 text-rose-700 border-rose-300', pulse: true };
    if (m <= 5) return { tone: 'soon', label: `⏱ עוד ${fmtDur(m)} · מוכן ${hhmm}`, cls: 'bg-orange-100 text-orange-700 border-orange-300' };
    return { tone: 'ok', label: `⏱ עוד ${fmtDur(m)} · מוכן ${hhmm}`, cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  };

  const renderCard = (o) => {
    const st = STATUS[o.status] || { label: o.status_label || o.status, tone: 'muted' };
    const isDelivery = o.fulfillment !== 'pickup';
    const open = isOpen(o);
    const urg = urgency(o);
    const active = ACTIVE.includes(o.status);
    const v = vip(o);
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
                  {v && <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${v.cls}`} style={v.style}>{v.label}</span>}
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
  };

  // Compact high-contrast card for the kitchen-wall board (big, glanceable).
  const WALL_TONE = { late: '#e11d48', soon: '#c2410c', ok: '#047857', stale: '#334155', none: '#334155' };
  const renderWallCard = (o) => {
    const isDelivery = o.fulfillment !== 'pickup';
    const urg = urgency(o);
    const items = o.items || [];
    return (
      <div key={o.id} className={`rounded-2xl border-2 p-4 ${urg?.pulse ? 'border-rose-500 animate-pulse' : 'border-slate-700'}`} style={{ background: '#111827' }}>
        <div className="flex items-center justify-between">
          <span className="text-3xl font-black text-white" dir="ltr">#{o.number}</span>
          <span className="text-xl">{isDelivery ? '🛵' : '🥡'}</span>
        </div>
        <div className="text-slate-300 text-lg mt-1">{itemCount(o)} מנות · {timeAgo(o.created)}</div>
        {/* What to make — the whole point of a kitchen wall */}
        {items.length > 0 && (
          <div className="mt-2 space-y-1">
            {items.slice(0, 5).map((it, i) => (
              <div key={i} className="text-white text-lg leading-tight">
                <span className="font-black">{it.qty}×</span> {it.name}
                {(it.meta || []).length > 0 && <span className="text-slate-400 text-sm"> · {it.meta.join(' · ')}</span>}
              </div>
            ))}
            {items.length > 5 && <div className="text-slate-400 text-sm">ועוד {items.length - 5}…</div>}
          </div>
        )}
        {urg && (
          <div className={`mt-3 rounded-xl px-3 py-2 text-xl font-black text-center ${urg.pulse ? 'text-white' : ''}`}
            style={{ background: WALL_TONE[urg.tone] || '#334155', color: '#fff' }}>
            {urg.label}
          </div>
        )}
        <div className="mt-3 flex gap-2">
          {(o.status === 'pending' || o.status === 'on-hold') && (
            <button onClick={() => setEtaFor(o.id)} disabled={busyId === o.id} className="flex-1 py-3 rounded-xl text-white text-lg font-black" style={{ background: '#b8442e' }}>קבל 👨‍🍳</button>
          )}
          {o.status === 'processing' && !o.ready_at && (
            <button onClick={() => setEtaFor(o.id)} disabled={busyId === o.id} className="flex-1 py-3 rounded-xl text-white text-lg font-black" style={{ background: '#d97706' }}>⏱ זמן</button>
          )}
          {o.status === 'processing' && (
            <button onClick={() => updateOrder(o, { status: 'completed' })} disabled={busyId === o.id} className="flex-1 py-3 rounded-xl text-white text-lg font-black" style={{ background: '#059669' }}>{isDelivery ? 'יצא 📲' : 'מוכן 📲'}</button>
          )}
        </div>
        {etaFor === o.id && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {ETA_OPTIONS.map((m) => (
              <button key={m} onClick={() => updateOrder(o, { prep_minutes: m, status: o.status === 'processing' ? undefined : 'processing' })} disabled={busyId === o.id}
                className="py-2 rounded-lg bg-slate-700 text-white font-bold">{m}׳</button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <PageGuard pageName="DeliveryOrders" pageTitle="הזמנות משלוחים">
      <PageShell>
        <PageHeader
          title="הזמנות אתר משלוחים"
          subtitle="הזמנות נכנסות בזמן אמת — קבלה, הכנה וסגירה, ישירות מכאן"
          icon={ClipboardList}
          action={connected ? (
            <div className="flex items-center gap-2">
              {/* View switcher — icon segmented, sits with the page chrome not the filters */}
              <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
                {VIEW_TABS.map((t) => {
                  const on = viewMode === t.k;
                  return (
                    <button key={t.k} onClick={() => setViewMode(t.k)} title={t.label} aria-label={t.label}
                      className={`p-1.5 rounded-md transition ${on ? 'bg-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                      style={on ? { color: '#b8442e' } : undefined}>
                      <t.Icon className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
              <Button variant="outline" size="sm" onClick={openReport} title="סיכום יום ל-WhatsApp" aria-label="סיכום יום">
                <BarChart3 className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => load(false)} disabled={loading}>
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          ) : null}
        />

        {!connected ? (
          <Card className="max-w-lg mx-auto"><CardContent className="p-6 text-center" dir="rtl">
            <p className="text-slate-600">אתר המשלוחים לא מחובר. חברו אותו קודם בעמוד "אתר משלוחים".</p>
          </CardContent></Card>
        ) : (
          <div className={`space-y-4 mx-auto ${viewMode === 'board' ? 'max-w-6xl' : 'max-w-2xl'}`} dir="rtl">

            {/* KPI strip */}
            <div className={`grid gap-2 ${onTimePct !== null ? 'grid-cols-5' : 'grid-cols-4'}`}>
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
              {onTimePct !== null && (
                <div className={`rounded-xl border p-2.5 text-center ${onTimePct >= 80 ? 'border-emerald-200 bg-emerald-50' : onTimePct >= 50 ? 'border-amber-200 bg-amber-50' : 'border-rose-200 bg-rose-50'}`} title={`${_onTime} מתוך ${_acc.length} הזמנות עמדו בזמן שהובטח`}>
                  <div className={`text-2xl font-extrabold leading-none ${onTimePct >= 80 ? 'text-emerald-600' : onTimePct >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>{onTimePct}<span className="text-sm">%</span></div>
                  <div className="text-[11px] text-slate-500 mt-1">בזמן שהובטח</div>
                </div>
              )}
            </div>

            {/* Stale cleanup nudge — old orders stuck "in prep" (usually forgotten/test) */}
            {staleCount > 0 && viewMode !== 'wall' && (
              <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <span>🕰</span>
                <span className="flex-1">{staleCount} הזמנות ישנות עדיין ב״בהכנה״ — שווה לסגור או לבטל כדי לנקות את הלוח.</span>
              </div>
            )}

            {/* Controls */}
            <Card>
              <CardContent className="p-3 space-y-3">
                {/* Search + sound */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 right-3 text-slate-400" />
                    <Input className="pr-9 h-10 rounded-xl bg-slate-50 border-slate-200 focus-visible:bg-white" placeholder="חיפוש: מס׳ הזמנה / שם / טלפון" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  <button
                    onClick={() => enableSound(!soundOn)}
                    title={soundOn ? 'התראות קוליות פעילות' : 'התראות קוליות כבויות'}
                    aria-label={soundOn ? 'כבה התראות קוליות' : 'הפעל התראות קוליות'}
                    className={`flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center transition ${soundOn ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-50 text-slate-400 border border-slate-200'}`}>
                    {soundOn ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                  </button>
                </div>

                {/* Status — the primary filter, prominent hummus segmented control */}
                <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto">
                  {STATUS_TABS.map((t) => {
                    const on = statusF === t.k;
                    return (
                      <button key={t.k} onClick={() => setStatusF(t.k)}
                        className={`flex-1 min-w-fit text-sm font-bold px-3 py-2 rounded-lg whitespace-nowrap transition flex items-center justify-center gap-1.5 ${on ? 'text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        style={on ? { background: '#b8442e' } : undefined}>
                        {t.label}
                        {t.k === 'active' && activeCount > 0 && <span className={`inline-flex items-center justify-center text-[11px] font-extrabold rounded-full min-w-5 h-5 px-1 ${on ? 'bg-white/25 text-white' : 'bg-amber-500 text-white'}`}>{activeCount}</span>}
                      </button>
                    );
                  })}
                </div>

                {/* Secondary filters — date + rating, one light row (no heavy pill chrome) */}
                <div className="flex items-center gap-1.5 overflow-x-auto text-sm -mx-0.5 px-0.5">
                  {DATE_TABS.map((t) => {
                    const on = dateF === t.k;
                    return (
                      <button key={t.k} onClick={() => setDateF(t.k)}
                        className="px-2.5 py-1 rounded-lg whitespace-nowrap font-semibold transition flex-shrink-0"
                        style={on ? { background: 'rgba(184,68,46,0.10)', color: '#b8442e' } : { color: '#94a3b8' }}>{t.label}</button>
                    );
                  })}
                  <span className="w-px h-4 bg-slate-200 flex-shrink-0 mx-0.5" />
                  {RATING_TABS.map((t) => {
                    const on = ratingF === t.k;
                    return (
                      <button key={t.k} onClick={() => setRatingF(t.k)}
                        className="px-2.5 py-1 rounded-lg whitespace-nowrap font-semibold transition flex-shrink-0"
                        style={on ? { background: 'rgba(184,68,46,0.10)', color: '#b8442e' } : { color: '#94a3b8' }}>{t.label}</button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Rush hour — accept every pending order at once */}
            {viewMode !== 'wall' && orders.filter((o) => o.status === 'pending' || o.status === 'on-hold').length >= 2 && (
              bulkPick ? (
                <Card><CardContent className="p-3">
                  <div className="text-sm font-bold mb-2" style={{ color: '#b8442e' }}>קבל {orders.filter((o) => o.status === 'pending' || o.status === 'on-hold').length} הזמנות להכנה — כמה זמן?</div>
                  <div className="grid grid-cols-3 gap-2">
                    {ETA_OPTIONS.map((m) => (
                      <button key={m} onClick={() => bulkAccept(m)} disabled={bulkBusy}
                        className="py-2.5 rounded-lg border font-bold" style={{ borderColor: '#e6b8ab', color: '#b8442e' }}>{m} דק׳</button>
                    ))}
                  </div>
                  <button className="text-xs text-slate-500 underline mt-2" onClick={() => setBulkPick(false)}>ביטול</button>
                </CardContent></Card>
              ) : (
                <button onClick={() => setBulkPick(true)} disabled={bulkBusy}
                  className="w-full py-3 rounded-xl text-white font-bold shadow-sm flex items-center justify-center gap-2 hover:opacity-90" style={{ background: '#b8442e' }}>
                  {bulkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : `⚡ קבל הכל (${orders.filter((o) => o.status === 'pending' || o.status === 'on-hold').length}) להכנה`}
                </button>
              )
            )}

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
              viewMode === 'board' ? (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {boardCols.map((col) => {
                    const cards = shown.filter(col.match);
                    return (
                      <div key={col.key} className="flex-1 min-w-[300px] space-y-3">
                        <div className="flex items-center justify-between px-1">
                          <span className="font-extrabold" style={{ color: col.accent }}>{col.title}</span>
                          <span className="text-xs font-bold text-white rounded-full px-2 py-0.5" style={{ background: col.accent }}>{cards.length}</span>
                        </div>
                        {cards.length === 0
                          ? <div className="text-center text-slate-300 text-sm py-10 border-2 border-dashed border-slate-200 rounded-xl">אין</div>
                          : cards.map(renderCard)}
                      </div>
                    );
                  })}
                </div>
              ) : viewMode === 'wall' ? null : (
                shown.map(renderCard)
              )
            )}

            {viewMode === 'wall' && (
              <div className="fixed inset-0 z-40 overflow-auto p-4" style={{ background: '#030712' }} dir="rtl">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-white text-2xl font-black">🖥️ קיר מטבח</span>
                    <span className="text-slate-400 text-sm">{updatedAt ? 'עודכן ' + updatedAt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    {overdueCount > 0 && <span className="px-3 py-1 rounded-full bg-rose-600 text-white font-black animate-pulse">🔴 {overdueCount} מאחרות</span>}
                  </div>
                  <button onClick={() => setViewMode('list')} className="px-4 py-2 rounded-xl bg-slate-700 text-white font-bold">✕ יציאה</button>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {boardCols.map((col) => {
                    const cards = shown.filter(col.match);
                    return (
                      <div key={col.key}>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xl font-black text-white">{col.title}</span>
                          <span className="text-lg font-black text-white rounded-full px-3 py-0.5" style={{ background: col.accent }}>{cards.length}</span>
                        </div>
                        <div className="space-y-3">
                          {cards.length === 0
                            ? <div className="text-center text-slate-600 py-12 border-2 border-dashed border-slate-700 rounded-2xl text-lg">—</div>
                            : cards.map(renderWallCard)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {report && (
              <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-3" onClick={() => setReport(null)}>
                <div className="bg-white rounded-2xl max-w-md w-full p-4 shadow-2xl" dir="rtl" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-extrabold text-slate-800 flex items-center gap-2"><BarChart3 className="w-5 h-5" style={{ color: '#b8442e' }} /> סיכום היום</span>
                    <button onClick={() => setReport(null)} className="text-slate-400 text-xl leading-none px-1" aria-label="סגור">✕</button>
                  </div>
                  {report === 'loading' ? (
                    <div className="py-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline ml-2" /> טוען…</div>
                  ) : (
                    <>
                      <pre className="whitespace-pre-wrap text-sm text-slate-700 bg-slate-50 rounded-xl p-3 leading-relaxed" style={{ fontFamily: 'inherit' }}>{report.text}</pre>
                      <div className="flex items-center justify-between mt-3 gap-2">
                        <span className={`text-sm font-semibold ${/נכשל|לא מוגדר|לא מחובר/.test(reportSent) ? 'text-rose-600' : 'text-emerald-600'}`}>{reportSent && reportSent !== 'sending' ? reportSent : ''}</span>
                        <Button onClick={sendReport} disabled={reportSent === 'sending' || !report.stats} className="text-white hover:opacity-90" style={{ background: '#25D366' }}>
                          {reportSent === 'sending' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שלח ל-WhatsApp 📲'}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
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
