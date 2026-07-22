// The HOME of a network-type tenant (e.g. nifusigroup): the whole Network HQ —
// branches + per-branch KPIs + the central בית הכנות — lives INSIDE the tenant,
// scoped to its own chain. No platform framing, no chain list. Reuses ChainCard.
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Network, RefreshCw } from 'lucide-react';
import PageGuard from '../components/shared/PageGuard';
import { ChainCard } from './NetworkHQ';

function NetworkDashboardInner() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const r = await base44.functions.getMyNetworkHome({}); setData(r?.data || r); }
    catch { setData(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Network className="w-6 h-6 text-amber-400" /> מטה הרשת{data?.chain?.name ? ` · ${data.chain.name}` : ''}
          </h1>
          <button onClick={load} className="text-slate-400 hover:text-white"><RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
        <p className="text-sm text-slate-400">תמונת-על של כל הסניפים ובית ההכנות המרכזי — הכל במקום אחד, בתוך הרשת.</p>

        {loading && !data ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
        ) : !data?.in_network ? (
          <div className="text-center text-slate-500 py-10 border border-slate-800 rounded-2xl">
            הטננט הזה אינו משויך לרשת. אם זו טעות — פנה למנהל הפלטפורמה.
          </div>
        ) : (
          <ChainCard chain={data.chain} available={[]} isSuper={false} onChanged={load} hideCommissary hideTasks />
        )}
      </div>
    </div>
  );
}

export default function NetworkDashboard() {
  return (
    <PageGuard pageName="NetworkDashboard" pageTitle="מטה הרשת">
      <NetworkDashboardInner />
    </PageGuard>
  );
}
