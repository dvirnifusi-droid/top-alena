// Operating-costs view — real AI spend + messaging estimate + infra, plus a
// concrete "how to get near-zero" playbook. Owner-only.
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';
import { Loader2, RefreshCw, Brain, MessageCircle, Server, Mail, Globe, TrendingDown } from 'lucide-react';

const W = { terracotta: '#A04A2E', olive: '#44512C', gold: '#C9A15A', goldLo: '#7c5626', cream: '#FAF5E8', creamCard: '#F4ECD8', border: '#E8D9B5', charcoal: '#1F1B17', muted: '#7A6F5D' };
const ils = (n) => `₪${Math.round(Number(n) || 0).toLocaleString()}`;

function Inner() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); try { const r = await base44.functions.getOperatingCosts({}); setD(r?.data || r); } catch (e) { setD({ error: e?.message }); } setLoading(false); };
  useEffect(() => { load(); }, []);

  const rows = d && !d.error ? [
    { icon: MessageCircle, label: 'הודעות (Twilio)', sub: `${d.messaging?.out ?? 0} הודעות יוצאות החודש · הערכה`, val: d.messaging?.est_ils, tone: W.terracotta, big: true },
    { icon: Brain, label: 'בינה מלאכותית (Gemini)', sub: `${(d.ai?.calls ?? 0).toLocaleString()} קריאות · ${Math.round((d.ai?.tokens ?? 0) / 1000)}K טוקנים · אמיתי`, val: d.ai?.ils, tone: '#2E7DFF' },
    { icon: Server, label: 'שרת (Hetzner)', sub: 'מריץ את כל המערכת · הערכה', val: d.fixed?.server_ils, tone: W.olive },
    { icon: Mail, label: 'מיילים (Resend)', sub: 'הערכה', val: d.fixed?.email_ils, tone: W.gold },
    { icon: Globe, label: 'דומיין', sub: 'topalena.com · הערכה', val: d.fixed?.domain_ils, tone: W.muted },
  ] : [];

  return (
    <div dir="rtl" className="p-4 md:p-6 min-h-screen" style={{ background: 'linear-gradient(180deg,#FBF7EE,#F4ECD8)' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700&display=swap');.oc-serif{font-family:'Frank Ruhl Libre',Georgia,serif;}`}</style>
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="oc-serif text-2xl font-bold flex items-center gap-2" style={{ color: W.terracotta }}>💰 עלויות תפעול</h1>
          <button onClick={load} className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#fff', border: `1px solid ${W.border}` }}><RefreshCw className="w-4 h-4" style={{ color: W.muted }} /></button>
        </div>

        {loading ? (
          <div className="text-center py-16"><Loader2 className="w-7 h-7 animate-spin mx-auto" style={{ color: W.gold }} /></div>
        ) : d?.error ? (
          <p className="text-center text-red-600 py-8">שגיאה: {d.error}</p>
        ) : (
          <>
            {/* total */}
            <div className="rounded-3xl p-5 text-center" style={{ background: `linear-gradient(160deg,${W.olive},#33401f)`, color: '#fff' }}>
              <div className="text-sm opacity-80">סה"כ מוערך לחודש ({d.month})</div>
              <div className="text-4xl font-black mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>{ils(d.total_est_ils)}</div>
              <div className="text-xs opacity-70 mt-1">≈ ${Math.round((d.total_est_ils || 0) / (d.usd_ils || 3.7))} · הסכום המדויק ל-Twilio נמצא בחשבונית Twilio</div>
            </div>

            {/* breakdown */}
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="rounded-2xl p-3 flex items-center gap-3" style={{ background: '#FFFDF8', border: `1px solid ${W.border}` }}>
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: W.creamCard }}><r.icon className="w-5 h-5" style={{ color: r.tone }} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm" style={{ color: W.charcoal }}>{r.label}</div>
                    <div className="text-[11px]" style={{ color: W.muted }}>{r.sub}</div>
                  </div>
                  <div className="font-black text-lg" style={{ color: r.tone, fontVariantNumeric: 'tabular-nums' }}>{ils(r.val)}</div>
                </div>
              ))}
            </div>

            {/* near-zero playbook */}
            <div className="rounded-3xl p-5" style={{ background: '#FFFDF8', border: `2px solid ${W.gold}` }}>
              <h2 className="oc-serif text-lg font-bold flex items-center gap-2 mb-3" style={{ color: W.olive }}><TrendingDown className="w-5 h-5" /> איך מורידים לתפעול כמעט-אפסי</h2>
              <ul className="space-y-2.5 text-sm" style={{ color: W.charcoal }}>
                <li><b style={{ color: W.terracotta }}>1. הודעות = המנוף הגדול.</b> להעדיף <b>וואטסאפ על SMS</b> (זול פי ~5-10). לענות בתוך חלון 24ש' (שיחות-שירות זולות/חינם), ולצמצם דיוור יזום מיותר.</li>
                <li><b style={{ color: W.terracotta }}>2. Meta ישירות במקום Twilio.</b> מעבר ל-<b>WhatsApp Cloud API של Meta</b> חוסך את העמלה של Twilio + נותן ~1000 שיחות-שירות חינם בחודש. זה השינוי המבני שחותך הכי הרבה.</li>
                <li><b style={{ color: W.terracotta }}>3. AI — כבר זול.</b> רץ על Gemini Flash (זול) + מנצל שכבת-חינם. לצמצם קריאות כפולות. כמעט אפס.</li>
                <li><b style={{ color: W.terracotta }}>4. שרת — כבר מינימלי.</b> VPS אחד מריץ את כל הטננטים. אפשר להקטין אם עודף כוח.</li>
                <li><b style={{ color: W.terracotta }}>5. מיילים — שכבת-חינם.</b> Resend נותן ~3000 מיילים/חודש חינם — כנראה כבר בחינם.</li>
              </ul>
              <p className="text-xs mt-3 pt-3" style={{ color: W.muted, borderTop: `1px solid ${W.border}` }}>
                <b>המסקנה:</b> העלות הקבועה (שרת+מייל+AI) יכולה לרדת ל-<b>~₪150-250/חודש</b>. ההודעות הן המשתנה — עם וואטסאפ-בלבד + Meta ישיר, אפשר לחתוך אותן משמעותית. אין דרך ל-0 מוחלט (חייבים שרת), אבל אפשר להתקרב מאוד.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function OperatingCostsPage() {
  return (
    <PageGuard pageName="OperatingCosts" pageTitle="עלויות תפעול">
      <Inner />
    </PageGuard>
  );
}
