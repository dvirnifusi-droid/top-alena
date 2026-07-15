import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import {
  Crown, Users, Building, Clock, CheckCircle2, Sparkles, Layers, Send,
  CreditCard, Activity, Loader2, ExternalLink, RefreshCw,
} from 'lucide-react';

// Super-Admin console HOME. Rendered inside PlatformLayout (which owns the
// top-nav + platform-owner gate). This page is the macro overview: platform
// health at a glance + tiles into every management tool. It intentionally shows
// NO single-tenant operational data (unpaid invoices / shifts / contracts) —
// that lives per-restaurant, not at the platform layer.

const TILES = [
  { key: 'PlatformAdminPending', title: 'אישור מסעדות חדשות', desc: 'אשר או דחה בקשות הצטרפות למערכת', icon: CheckCircle2, color: 'bg-emerald-500', badge: (s) => s?.pending_approval || 0, badgeLabel: 'ממתינות' },
  { key: 'PlatformAdminTenants', title: 'כל המסעדות', desc: 'צפה, נהל, היכנס כבעלים, שלח פרטים, התקן מחדש', icon: Building, color: 'bg-blue-500', badge: (s) => s?.live || 0, badgeLabel: 'פעילות' },
  { key: 'PlatformFeatures', title: "פיצ'רים גלובליים", desc: 'הפעל/חסום פיצ׳רים וחבילות לכל המסעדות', icon: Sparkles, color: 'bg-fuchsia-500', badge: () => null },
  { key: 'PlatformSubscriptions', title: 'ניהול מנויים', desc: 'חבילות, תוקף, חידוש והכנסה חוזרת (MRR)', icon: CreditCard, color: 'bg-amber-500', badge: () => null, crown: true },
  { key: 'PlatformUsers', title: 'ניהול משתמשים', desc: 'כל המשתמשים בכל המסעדות', icon: Users, color: 'bg-orange-500', badge: (s, m) => m?.totals?.users || null, badgeLabel: 'משתמשים' },
  { key: 'PlatformInvites', title: 'הזמנות למערכת', desc: 'נהל את ההזמנות לעסקים חדשים', icon: Send, color: 'bg-violet-500', badge: () => null },
  { key: 'PlatformWhiteLabel', title: 'הגדרות White Label', desc: 'מיתוג ברירת מחדל לפלטפורמה', icon: Layers, color: 'bg-teal-500', badge: () => null },
  { key: 'PlatformAdminTenants', title: 'בריאות מערכת', desc: 'אבחון ערוצים (SMS/מייל/וואטסאפ) וסטטוס התקנות', icon: Activity, color: 'bg-slate-500', badge: (s) => s?.failed || null, badgeLabel: 'נכשלו' },
];

export default function PlatformAdmin() {
  const [stats, setStats] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [ownerName, setOwnerName] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [statsRes, metricsRes, meRes] = await Promise.all([
        base44.functions.getTenantStats({}).catch(() => null),
        base44.functions.getSuperAdminMetrics({}).catch(() => null),
        base44.auth.me().catch(() => null),
      ]);
      setStats(statsRes?.data || statsRes);
      setMetrics(metricsRes?.data || metricsRes);
      setOwnerName(meRes?.full_name || meRes?.name || '');
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const totalTenants = stats
    ? (stats.live || 0) + (stats.pending_approval || 0) + (stats.provisioning || 0) + (stats.failed || 0) + (stats.rejected || 0)
    : 0;

  const macro = [
    { label: 'מסעדות פעילות', value: stats?.live ?? '—', icon: Building, tint: 'text-emerald-400' },
    { label: 'ממתינות לאישור', value: stats?.pending_approval ?? '—', icon: Clock, tint: 'text-amber-400' },
    { label: 'משתמשים במערכת', value: metrics?.totals?.users ?? '—', icon: Users, tint: 'text-purple-400' },
    { label: 'סה"כ מסעדות', value: loading ? '—' : totalTenants, icon: Sparkles, tint: 'text-sky-400' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      {/* Welcome banner — "the layer above the restaurants" */}
      <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-l from-amber-500/10 via-slate-900 to-slate-900 p-6 relative overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Crown className="w-6 h-6 text-amber-400" /> שלום{ownerName ? `, ${ownerName}` : ''}
            </h1>
            <p className="text-slate-300 mt-2 max-w-2xl">
              מכאן אתה שולט בכל המערכת — כל המסעדות, כל הפיצ׳רים, כל המשתמשים.
            </p>
            <p className="text-amber-300 font-semibold mt-1">זה לא שייך לאף מסעדה — זוהי השכבה שמעליהן.</p>
          </div>
          <button onClick={load} className="bg-slate-800 hover:bg-slate-700 rounded-lg p-2 text-slate-300" title="רענן">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Macro metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {macro.map(c => (
          <div key={c.label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center justify-between">
              <c.icon className={`w-6 h-6 ${c.tint}`} />
            </div>
            <div className="text-3xl font-bold text-white mt-3">{c.value}</div>
            <div className="text-xs text-slate-400 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Management tools */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 mb-3">כלי ניהול מערכתיים</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {TILES.map((t, i) => {
            const badge = t.badge?.(stats, metrics);
            return (
              <Link key={i} to={createPageUrl(t.key)} className="group">
                <div className="h-full rounded-xl border border-slate-800 bg-slate-900 hover:border-slate-600 hover:bg-slate-800/60 transition p-5">
                  <div className={`${t.color} text-white rounded-lg w-11 h-11 flex items-center justify-center`}>
                    <t.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-white mt-3 flex items-center gap-1.5">
                    {t.crown && <Crown className="w-4 h-4 text-amber-400" />}{t.title}
                  </h3>
                  <p className="text-sm text-slate-400 mt-1">{t.desc}</p>
                  {badge != null && (
                    <div className="mt-2 text-xs font-bold text-amber-400">{badge} {t.badgeLabel || ''}</div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Public signup link */}
      <a href="/Signup" target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200">
        <ExternalLink className="w-4 h-4" /> קישור רישום ציבורי למסעדות חדשות: topalena.com/Signup
      </a>
    </div>
  );
}
