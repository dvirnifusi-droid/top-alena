// Compact "money in the current shift" — the bottom line the owner asked for:
// closed vs open money, split per channel (dine-in / takeaway / delivery).
// Real data from the latest Beecomm snapshot; links to the full Beecomm Live.
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Loader2, RefreshCw, ArrowLeft } from 'lucide-react';

const ils = (n) => `₪${Number(n || 0).toLocaleString()}`;

export default function ShiftMoneyWidget() {
  const [snap, setSnap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { const r = await base44.functions.getLatestBeecommSnapshot({}); setSnap((r?.data ?? r) || null); }
    catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const refresh = async () => {
    setBusy(true);
    try { await base44.functions.captureBeecommSnapshot({}); } catch { /* ignore */ }
    await load(); setBusy(false);
  };

  if (loading) return <div className="rounded-2xl border bg-white p-6 flex justify-center" style={{ borderColor: '#E8D9B5' }}><Loader2 className="w-5 h-5 animate-spin text-amber-500" /></div>;
  if (!snap) return null;

  const channels = [
    { name: '🪑 במקום', d: snap.dine_in, c: '#0f766e', bg: '#E1F0EC' },
    { name: '🥡 איסוף', d: snap.takeaway, c: '#b45309', bg: '#FBF0DC' },
    { name: '🛵 משלוח', d: snap.delivery, c: '#7A3722', bg: '#F4ECD8' },
  ];

  return (
    <section>
      <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: '#E8D9B5' }}>
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-lg font-bold text-slate-900">💵 כסף במשמרת עכשיו</h2>
          <button onClick={refresh} disabled={busy} className="text-slate-400 hover:text-slate-600 p-1"><RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} /></button>
        </div>

        {/* closed vs open */}
        <div className="grid grid-cols-2 gap-3 px-4 pt-3">
          <div className="rounded-2xl p-4 text-center" style={{ background: '#EAF3E1' }}>
            <div className="text-3xl font-black tabular-nums" style={{ color: '#4b7a2b' }}>{ils(snap.total_today)}</div>
            <div className="text-xs font-semibold text-slate-600 mt-1">💚 כסף סגור</div>
          </div>
          <div className="rounded-2xl p-4 text-center" style={{ background: '#FBEADF' }}>
            <div className="text-3xl font-black tabular-nums" style={{ color: '#c2410c' }}>{ils(snap.open_money)}</div>
            <div className="text-xs font-semibold text-slate-600 mt-1">🟠 כסף פתוח</div>
          </div>
        </div>

        {/* per channel */}
        <div className="grid grid-cols-3 gap-2 px-4 py-4">
          {channels.map((ch, i) => {
            const d = ch.d || {};
            return (
              <div key={i} className="rounded-xl p-2.5 text-center" style={{ background: ch.bg }}>
                <div className="text-[11px] font-bold" style={{ color: ch.c }}>{ch.name}</div>
                <div className="text-lg font-black tabular-nums mt-0.5" style={{ color: ch.c }}>{ils(d.sum)}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{Number(d.count) || 0} הזמנות</div>
              </div>
            );
          })}
        </div>

        <Link to={createPageUrl('BeecommLive')} className="flex items-center justify-center gap-1 text-[12px] font-semibold text-amber-700 border-t py-2.5" style={{ borderColor: '#F0E4C6' }}>
          לפירוט המלא של הקופה <ArrowLeft className="w-3.5 h-3.5" />
        </Link>
      </div>
    </section>
  );
}
