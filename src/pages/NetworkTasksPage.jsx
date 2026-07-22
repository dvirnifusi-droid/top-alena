// Network-wide tasks as their own page inside a network tenant — a chain-level
// task fans out to every branch and is tracked from here.
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Target } from 'lucide-react';
import PageGuard from '../components/shared/PageGuard';
import { NetworkTasks } from './NetworkHQ';

function NetworkTasksInner() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.functions.getMyNetworkHome({})
      .then((r) => setData(r?.data || r))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-2xl font-black flex items-center gap-2">
          <Target className="w-6 h-6 text-pink-400" /> משימות רשתיות{data?.chain?.name ? ` · ${data.chain.name}` : ''}
        </h1>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
        ) : !data?.in_network ? (
          <div className="text-center text-slate-500 py-10 border border-slate-800 rounded-2xl">הטננט הזה אינו משויך לרשת.</div>
        ) : (
          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
            <NetworkTasks chainId={data.chain.id} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function NetworkTasksPage() {
  return (
    <PageGuard pageName="NetworkTasksPage" pageTitle="משימות רשתיות">
      <NetworkTasksInner />
    </PageGuard>
  );
}
