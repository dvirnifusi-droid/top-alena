// "מקורות הידע" — full transparency into what DVIR AI actually knows right now:
// the live app data (with counts + samples + a link to edit the source) plus the
// uploaded files. So it's never a black box — the owner sees exactly what feeds it.
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import {
  Brain, UtensilsCrossed, Users, Truck, ListChecks, ClipboardList, Store,
  Loader2, ArrowLeft, CheckCircle2, AlertCircle, FileText,
} from 'lucide-react';

const LIVE_SOURCES = [
  { key: 'menu', label: 'תפריט', icon: UtensilsCrossed, page: 'MenuManagement', unit: 'מנות' },
  { key: 'employees', label: 'עובדים', icon: Users, page: 'Employees', unit: 'עובדים' },
  { key: 'suppliers', label: 'ספקים', icon: Truck, page: 'Suppliers', unit: 'ספקים' },
  { key: 'checklists', label: 'צ׳קליסטים', icon: ListChecks, page: 'Checklists', unit: 'רשימות' },
  { key: 'orderLists', label: 'רשימות הזמנות', icon: ClipboardList, page: 'OrderList', unit: 'רשימות' },
];

export default function DvirKnowledgePanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await base44.functions.getDvirKnowledgeSources();
      setData(res?.data || res);
    } catch (e) {
      setError(e?.message || 'שגיאה בטעינה');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[#8A7C64] py-8 justify-center">
        <Loader2 className="w-5 h-5 animate-spin" /> בודק מה ה-DVIR AI יודע…
      </div>
    );
  }
  if (error) {
    return <div className="text-sm text-red-600 flex items-center gap-1.5 py-4"><AlertCircle className="w-4 h-4" /> {error}</div>;
  }

  const live = data?.live || {};
  const profile = live.profile;
  const files = Array.isArray(data?.files) ? data.files : [];

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className="rounded-2xl bg-gradient-to-br from-[#FBF6EA] to-[#F1E6CE] border border-[#EADFC8] p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[var(--brand-primary,#A04A2E)] flex items-center justify-center shrink-0">
          <Brain className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="font-display text-lg text-[#2A2018] leading-tight">מה שה-DVIR AI יודע עכשיו</p>
          <p className="text-sm text-[#8A7C64] mt-0.5">
            כל מה שאתה מזין באפליקציה נכנס לכאן אוטומטית — בלי להעלות שוב. זה מה שה-AI מסתמך עליו כשהוא עונה לך.
          </p>
        </div>
      </div>

      {/* Live app data */}
      <div>
        <p className="text-xs font-bold text-[#8A7C64] uppercase tracking-wide mb-2 px-1">נתונים חיים מהאפליקציה</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {/* Business profile */}
          <SourceCard
            icon={Store} label="פרטי העסק" page="Branding"
            connected={!!profile?.restaurant_name}
            countText={profile?.restaurant_name || 'לא הוגדר'}
            samples={[profile?.cuisine_style, profile?.address, profile?.phone, profile?.has_hours ? 'שעות פתיחה ✓' : null].filter(Boolean)}
          />
          {LIVE_SOURCES.map((s) => {
            const d = live[s.key] || { count: 0, sample: [] };
            return (
              <SourceCard
                key={s.key} icon={s.icon} label={s.label} page={s.page}
                connected={d.count > 0}
                countText={`${d.count} ${s.unit}`}
                samples={d.sample || []}
              />
            );
          })}
        </div>
      </div>

      {/* Uploaded files */}
      <div>
        <p className="text-xs font-bold text-[#8A7C64] uppercase tracking-wide mb-2 px-1">קבצים שהעלית ({files.length})</p>
        {files.length === 0 ? (
          <div className="text-sm text-[#8A7C64] bg-[#FBF6EA] border border-[#EADFC8] rounded-xl p-3">
            אין קבצים שהועלו. אפשר להוסיף קבצים (PDF / וורד / טקסט) למטה — הם מצטרפים לידע החי מהאפליקציה.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-white border border-[#EADFC8] rounded-lg px-2.5 py-1.5 text-xs text-[#2A2018]">
                <FileText className="w-3.5 h-3.5 text-[var(--brand-primary,#A04A2E)] shrink-0" />
                <span className="truncate max-w-[180px]">{f.file_name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceCard({ icon: Icon, label, page, connected, countText, samples }) {
  return (
    <div className="rounded-2xl border border-[#EADFC8] bg-white/70 p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#F7EFDD] flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-[var(--brand-primary,#A04A2E)]" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-[#2A2018] leading-tight">{label}</p>
            <p className="text-xs text-[#8A7C64]">{countText}</p>
          </div>
        </div>
        {connected
          ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" title="מחובר" />
          : <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" title="ריק" />}
      </div>
      {samples?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {samples.slice(0, 5).map((s, i) => (
            <span key={i} className="text-[11px] bg-[#FBF6EA] text-[#6B5D45] rounded-md px-1.5 py-0.5 truncate max-w-[150px]">{s}</span>
          ))}
        </div>
      )}
      <a href={`/${page}`} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--brand-primary,#A04A2E)] hover:underline">
        {connected ? 'עדכן' : 'הוסף עכשיו'} <ArrowLeft className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}
