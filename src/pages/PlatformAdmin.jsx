import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Crown, CheckCircle2, Clock, AlertTriangle, Building, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

function PlatformAdminInner() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.getTenantStats({});
      setStats(res?.data || res);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const cards = stats ? [
    { label: 'מסעדות פעילות', value: stats.live, icon: Building, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'ממתינות לאישור', value: stats.pending_approval, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'בתהליך התקנה', value: stats.provisioning, icon: Loader2, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'נכשלו', value: stats.failed, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
  ] : [];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto" dir="rtl">
      <div className="bg-gradient-to-l from-amber-500 to-orange-600 text-white rounded-xl p-6">
        <div className="flex items-center gap-3">
          <Crown className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">Platform Admin</h1>
            <p className="text-sm text-white/80 mt-1">קונסולת ניהול-על — כל המסעדות, המשתמשים והפיצ'רים</p>
          </div>
          <button onClick={load} className="ml-auto bg-white/20 hover:bg-white/30 rounded-lg p-2">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading || !stats ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {cards.map(c => (
            <Card key={c.label} className={c.bg}>
              <CardContent className="p-4 flex items-center gap-3">
                <c.icon className={`w-8 h-8 ${c.color}`} />
                <div>
                  <div className="text-xs text-slate-600">{c.label}</div>
                  <div className="text-2xl font-bold mt-0.5">{c.value}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Link to={createPageUrl('PlatformAdminPending')} className="block">
          <Card className="hover:border-amber-400 transition cursor-pointer h-full">
            <CardContent className="p-5">
              <div className="bg-amber-500 text-white rounded-lg p-2 inline-block">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h3 className="font-bold mt-3">אישור מסעדות חדשות</h3>
              <p className="text-sm text-slate-600 mt-1">אשר או דחה בקשות הצטרפות למערכת</p>
              {stats?.pending_approval > 0 && (
                <div className="mt-2 text-xs font-bold text-amber-600">{stats.pending_approval} ממתינות</div>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link to={createPageUrl('PlatformAdminTenants')} className="block">
          <Card className="hover:border-blue-400 transition cursor-pointer h-full">
            <CardContent className="p-5">
              <div className="bg-blue-500 text-white rounded-lg p-2 inline-block">
                <Building className="w-5 h-5" />
              </div>
              <h3 className="font-bold mt-3">כל המסעדות</h3>
              <p className="text-sm text-slate-600 mt-1">צפה ונהל את כל המסעדות הרשומות במערכת</p>
              {stats?.live > 0 && (
                <div className="mt-2 text-xs font-bold text-blue-600">{stats.live} פעילות</div>
              )}
            </CardContent>
          </Card>
        </Link>

        <Card className="opacity-50">
          <CardContent className="p-5">
            <div className="bg-slate-400 text-white rounded-lg p-2 inline-block">
              <Crown className="w-5 h-5" />
            </div>
            <h3 className="font-bold mt-3">ניהול מנויים</h3>
            <p className="text-sm text-slate-600 mt-1">מתכננים — חיובים, חבילות, ימי ניסיון</p>
            <div className="mt-2 text-xs font-bold text-slate-500">בקרוב</div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-50">
        <CardContent className="p-4 text-xs text-slate-600">
          <strong>קישור רישום ציבורי:</strong> <code className="bg-white px-2 py-0.5 rounded">topalena.com/Signup</code>
          <br />
          שתף עם מסעדות חדשות. הן רושמות שם, אתה מאשר כאן, המערכת מקצה להן תת-דומיין אוטומטית.
        </CardContent>
      </Card>
    </div>
  );
}

export default function PlatformAdmin() {
  return (
    <PageGuard pageName="PlatformAdmin" pageTitle="Platform Admin">
      <PlatformAdminInner />
    </PageGuard>
  );
}
