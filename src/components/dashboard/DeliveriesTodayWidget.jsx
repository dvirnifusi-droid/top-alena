// Compact "deliveries today" bottom line — how many deliveries and how much
// money they brought. Real data from the latest Gomiley snapshot.
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Loader2, RefreshCw, ArrowLeft, Bike } from 'lucide-react';

const ils = (n) => `₪${Number(n || 0).toLocaleString()}`;

export default function DeliveriesTodayWidget() {
  const [snap, setSnap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { const r = await base44.functions.getLatestGomileySnapshot({}); setSnap((r?.data ?? r) || null); }
    catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const refresh = async () => {
    setBusy(true);
    try { await base44.functions.captureGomileySnapshot({}); } catch { /* ignore */ }
    await load(); setBusy(false);
  };

  if (loading) return <div className="rounded-2xl border bg-white p-6 flex justify-center" style={{ borderColor: '#E8D9B5' }}><Loader2 className="w-5 h-5 animate-spin text-amber-500" /></div>;
  if (!snap) return null;

  // top sources from the orders array (real)
  const orders = Array.isArray(snap.orders) ? snap.orders : [];
  const bySource = orders.reduce((m, o) => { const s = o.source || o.platform || 'אחר'; m[s] = (m[s] || 0) + 1; return m; }, {});
  const sources = Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <section>
      <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: '#E8D9B5' }}>
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Bike className="w-5 h-5 text-rose-500" /> משלוחים היום</h2>
          <button onClick={refresh} disabled={busy} className="text-slate-400 hover:text-slate-600 p-1"><RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 px-4 py-4">
          <div className="rounded-2xl p-4 text-center" style={{ background: '#EAF3E1' }}>
            <div className="text-3xl font-black tabular-nums" style={{ color: '#0f766e' }}>{ils(snap.total_income)}</div>
            <div className="text-xs font-semibold text-slate-600 mt-1">💰 הכנסה ממשלוחים</div>
          </div>
          <div className="rounded-2xl p-4 text-center" style={{ background: '#F3E6F0' }}>
            <div className="text-3xl font-black tabular-nums" style={{ color: '#9333ea' }}>{snap.total_orders || 0}</div>
            <div className="text-xs font-semibold text-slate-600 mt-1">🛵 משלוחים{snap.cancelled_orders ? ` · ${snap.cancelled_orders} בוטלו` : ''}</div>
          </div>
        </div>

        {sources.length > 0 && (
          <div className="flex gap-2 flex-wrap px-4 pb-3">
            {sources.map(([s, n], i) => (
              <span key={i} className="text-[11px] font-semibold rounded-full px-2.5 py-1" style={{ background: '#FBF0DC', color: '#8a5a1e' }}>{s} · {n}</span>
            ))}
            {snap.cash_orders_count ? <span className="text-[11px] font-semibold rounded-full px-2.5 py-1" style={{ background: '#EAF3E1', color: '#4b7a2b' }}>💵 מזומן {snap.cash_orders_count} ({ils(snap.cash_orders_amount)})</span> : null}
          </div>
        )}

        <Link to={createPageUrl('DeliveriesHub')} className="flex items-center justify-center gap-1 text-[12px] font-semibold text-rose-600 border-t py-2.5" style={{ borderColor: '#F0E4C6' }}>
          לניהול המשלוחים <ArrowLeft className="w-3.5 h-3.5" />
        </Link>
      </div>
    </section>
  );
}
