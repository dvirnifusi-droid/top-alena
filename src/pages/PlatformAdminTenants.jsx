import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Building, RefreshCw, ExternalLink, Phone } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';

const STATUS_BADGE = {
  pending_approval: { label: 'ממתינה לאישור', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  pending_provisioning: { label: 'בתור התקנה', cls: 'bg-blue-100 text-blue-800 border-blue-300' },
  provisioning: { label: 'מתקין...', cls: 'bg-blue-100 text-blue-800 border-blue-300' },
  live: { label: '✅ פעילה', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  failed: { label: '⚠️ נכשלה', cls: 'bg-red-100 text-red-800 border-red-300' },
  rejected: { label: 'נדחתה', cls: 'bg-slate-200 text-slate-700 border-slate-300' },
};

function TenantsInner() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.listTenants(filter === 'all' ? {} : { status: filter });
      setTenants((res?.data || res)?.tenants || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const visible = tenants;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building className="w-6 h-6 text-blue-600" /> כל המסעדות
        </h1>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ml-1 ${loading ? 'animate-spin' : ''}`} /> רענן
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['all', 'live', 'pending_approval', 'pending_provisioning', 'failed', 'rejected'].map(f => (
          <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)}>
            {f === 'all' ? 'הכל' : STATUS_BADGE[f]?.label || f}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-slate-500">
            <Building className="w-12 h-12 mx-auto text-slate-300 mb-2" />
            אין מסעדות בקטגוריה הזו עדיין.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-xs text-slate-600">
                    <th className="p-3 text-right">מסעדה</th>
                    <th className="p-3 text-right">בעלים</th>
                    <th className="p-3 text-right">סלוג</th>
                    <th className="p-3 text-right">סטטוס</th>
                    <th className="p-3 text-right">כתובת</th>
                    <th className="p-3 text-right">נרשמה</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visible.map(t => {
                    const st = STATUS_BADGE[t.status] || { label: t.status, cls: 'bg-slate-100 text-slate-700 border-slate-300' };
                    return (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="p-3 font-semibold">{t.restaurant_name}</td>
                        <td className="p-3">
                          <div>{t.owner_name}</div>
                          <div className="text-xs text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" /> {t.owner_phone}</div>
                        </td>
                        <td className="p-3"><code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">{t.slug}</code></td>
                        <td className="p-3"><Badge className={`${st.cls} border text-xs`}>{st.label}</Badge></td>
                        <td className="p-3">
                          {t.status === 'live' ? (
                            <a href={t.subdomain_url} target="_blank" rel="noreferrer" className="text-blue-600 underline flex items-center gap-1 text-xs">
                              {t.subdomain_url.replace('https://', '')} <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-3 text-xs text-slate-500">{t.created_at?.slice(0, 10) || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function PlatformAdminTenants() {
  return (
    <PageGuard pageName="PlatformAdminTenants" pageTitle="כל המסעדות">
      <TenantsInner />
    </PageGuard>
  );
}
