// The central בית הכנות as its OWN page inside a network tenant — the full
// commissary flow (per-branch prep sheets, orders, buy, product tree, delivery
// notes, approvals). Extracted from the network dashboard so it can grow.
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Factory } from 'lucide-react';
import PageGuard from '../components/shared/PageGuard';
import { ChainCommissary } from './NetworkHQ';
import AiScannerButton from '@/components/scanner/AiScannerButton';
import { createPageUrl } from '@/utils';

function NetworkCommissaryInner() {
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
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Factory className="w-6 h-6 text-indigo-400" /> בית הכנות המרכזי{data?.chain?.name ? ` · ${data.chain.name}` : ''}
          </h1>
          <AiScannerButton target="recipe" label="🍳 סרוק מתכון / מנה" variant="default" className="bg-indigo-600 hover:bg-indigo-500" onImported={() => { window.location.href = createPageUrl('Recipes'); }} />
        </div>
        <p className="text-xs text-slate-400">שלח/צלם מתכון או מנה → מהונדס לאחור לחומרי גלם, מתומחר מעץ המוצר, ונוסף כהכנה. (מופיע ב"🌳 עץ מוצר" — משם "פרסם לרשת" כדי שהסניפים יזמינו).</p>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
        ) : !data?.in_network ? (
          <div className="text-center text-slate-500 py-10 border border-slate-800 rounded-2xl">הטננט הזה אינו משויך לרשת.</div>
        ) : (
          <ChainCommissary chainId={data.chain.id} defaultOpen />
        )}
      </div>
    </div>
  );
}

export default function NetworkCommissary() {
  return (
    <PageGuard pageName="NetworkCommissary" pageTitle="בית הכנות">
      <NetworkCommissaryInner />
    </PageGuard>
  );
}
