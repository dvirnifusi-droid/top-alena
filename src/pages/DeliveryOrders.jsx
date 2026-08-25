import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, ClipboardList, RefreshCw, Bell, BellOff, Phone, MapPin } from 'lucide-react';
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
  const [soundOn, setSoundOn] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [flash, setFlash] = useState({});          // id → highlight new
  const [filter, setFilter] = useState('active');   // active | all

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
      const d = (await base44.functions.getDeliverySiteOrders({ limit: 40 }))?.data || {};
      if (d.connected === false) { setConnected(false); return; }
      setConnected(true);
      const list = Array.isArray(d.orders) ? d.orders : [];
      // New-order detection: an active order whose id we haven't seen before.
      const ids = new Set(list.map((o) => o.id));
      if (seenRef.current) {
        const fresh = list.filter((o) => ACTIVE.includes(o.status) && !seenRef.current.has(o.id));
        if (fresh.length) {
          if (soundOn) beep();
          const fl = {}; fresh.forEach((o) => { fl[o.id] = true; });
          setFlash((x) => ({ ...x, ...fl }));
          setTimeout(() => setFlash((x) => { const n = { ...x }; fresh.forEach((o) => delete n[o.id]); return n; }), 8000);
        }
      }
      seenRef.current = ids;
      setOrders(list);
      setUpdatedAt(new Date());
      setError('');
    } catch (e) {
      setError(e?.message || 'טעינת ההזמנות נכשלה');
    } finally {
      setLoading(false);
    }
  }, [soundOn, beep]);

  useEffect(() => { load(false); }, [load]);
  // Poll every 20s while the page is open.
  useEffect(() => {
    const t = setInterval(() => load(true), 20000);
    return () => clearInterval(t);
  }, [load]);

  const setStatus = async (o, status) => {
    setBusyId(o.id); setError('');
    try {
      const d = (await base44.functions.setDeliverySiteOrderStatus({ id: o.id, status }))?.data || {};
      if (d.ok) setOrders((os) => os.map((x) => (x.id === o.id ? { ...x, status: d.status, status_label: d.status_label } : x)));
      else setError(d.error || 'שינוי סטטוס נכשל');
    } catch (e) {
      setError(e?.message || 'שינוי סטטוס נכשל');
    } finally {
      setBusyId(null);
    }
  };

  const enableSound = (v) => {
    setSoundOn(v);
    if (v) beep(); // unlock audio + confirm it works, on the enabling gesture
  };

  const shown = orders.filter((o) => (filter === 'active' ? ACTIVE.includes(o.status) : true));
  const activeCount = orders.filter((o) => ACTIVE.includes(o.status)).length;

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

            {/* Controls */}
            <Card>
              <CardContent className="p-3 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1 bg-slate-100 rounded-full p-1">
                  <button onClick={() => setFilter('active')} className={`text-sm font-semibold px-3 py-1.5 rounded-full ${filter === 'active' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}>
                    פעילות {activeCount > 0 && <span className="mr-1 inline-flex items-center justify-center bg-amber-500 text-white text-[11px] rounded-full w-5 h-5">{activeCount}</span>}
                  </button>
                  <button onClick={() => setFilter('all')} className={`text-sm font-semibold px-3 py-1.5 rounded-full ${filter === 'all' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}>הכל</button>
                </div>
                <div className="flex items-center gap-2">
                  {soundOn ? <Bell className="w-4 h-4 text-emerald-600" /> : <BellOff className="w-4 h-4 text-slate-400" />}
                  <span className="text-sm text-slate-600">התראת קול</span>
                  <Switch checked={soundOn} onCheckedChange={enableSound} />
                </div>
              </CardContent>
            </Card>

            {error && <p className="text-sm font-semibold text-rose-600 text-center">{error}</p>}

            {loading && orders.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin ml-2" /> טוען הזמנות…</div>
            ) : shown.length === 0 ? (
              <Card><CardContent className="p-10 text-center text-slate-500" dir="rtl">
                <div className="text-4xl mb-2">🎉</div>
                <p className="font-semibold">{filter === 'active' ? 'אין הזמנות פעילות כרגע' : 'אין הזמנות'}</p>
                <p className="text-sm text-slate-400 mt-1">הזמנות חדשות יופיעו כאן אוטומטית.</p>
              </CardContent></Card>
            ) : (
              shown.map((o) => {
                const st = STATUS[o.status] || { label: o.status_label || o.status, tone: 'muted' };
                const isDelivery = o.fulfillment !== 'pickup';
                return (
                  <Card key={o.id} className={`transition ${flash[o.id] ? 'ring-2 ring-amber-400 shadow-lg' : ''}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-800" dir="ltr">#{o.number}</span>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${TONE[st.tone]}`}>{st.label}</span>
                            {flash[o.id] && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white animate-pulse">חדש!</span>}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">{timeAgo(o.created)} · {isDelivery ? '🛵 משלוח' : '🥡 איסוף'} · {o.payment || ''}</div>
                        </div>
                        <div className="text-lg font-extrabold text-emerald-700 whitespace-nowrap">₪{Number(o.total).toLocaleString()}</div>
                      </div>

                      {/* Customer */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        {o.customer && <span className="font-semibold text-slate-700">{o.customer}</span>}
                        {o.phone && <a href={`tel:${o.phone}`} className="inline-flex items-center gap-1 text-sky-600" dir="ltr"><Phone className="w-3.5 h-3.5" />{o.phone}</a>}
                      </div>
                      {isDelivery && o.address && (
                        <div className="flex items-start gap-1 text-sm text-slate-600"><MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /><span>{o.address}</span></div>
                      )}
                      {o.note && <div className="text-xs bg-amber-50 text-amber-800 rounded-lg p-2">📝 {o.note}</div>}

                      {/* Items */}
                      <div className="border-t border-slate-100 pt-2 space-y-1.5">
                        {(o.items || []).map((it, i) => (
                          <div key={i} className="text-sm">
                            <div className="flex justify-between">
                              <span className="font-semibold text-slate-800">{it.qty}× {it.name}</span>
                            </div>
                            {(it.meta || []).length > 0 && (
                              <div className="text-xs text-slate-500 pr-4">{it.meta.join(' · ')}</div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Status actions */}
                      <div className="flex gap-2 pt-1">
                        {(o.status === 'pending' || o.status === 'on-hold') && (
                          <Button size="sm" className="flex-1 bg-amber-500 hover:bg-amber-600" onClick={() => setStatus(o, 'processing')} disabled={busyId === o.id}>
                            {busyId === o.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'קבל להכנה 👨‍🍳'}
                          </Button>
                        )}
                        {o.status === 'processing' && (
                          <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setStatus(o, 'completed')} disabled={busyId === o.id}>
                            {busyId === o.id ? <Loader2 className="w-4 h-4 animate-spin" /> : (isDelivery ? 'יצא למשלוח ✓' : 'נמסר ✓')}
                          </Button>
                        )}
                        {ACTIVE.includes(o.status) && (
                          <Button size="sm" variant="outline" className="text-rose-600 border-rose-200" onClick={() => setStatus(o, 'cancelled')} disabled={busyId === o.id}>
                            ביטול
                          </Button>
                        )}
                        {o.status === 'completed' && <span className="text-sm text-emerald-600 font-semibold py-1.5">✓ הושלמה</span>}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}
      </PageShell>
    </PageGuard>
  );
}
