import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Clock, CheckCircle2, X, RefreshCw, Phone, Mail, Building } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';

function PendingApprovalInner() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.listTenants({ status: 'pending_approval' });
      setTenants((res?.data || res)?.tenants || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const approve = async (t) => {
    if (!window.confirm(`לאשר את "${t.restaurant_name}"?\n\nהמערכת תקצה לה את ${t.subdomain_url} ותתקין קונטיינר נפרד אוטומטית.`)) return;
    setBusyId(t.id);
    try {
      await base44.functions.approveTenant({ tenant_id: t.id });
      await load();
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setBusyId(null); }
  };

  const reject = async (t) => {
    const reason = window.prompt(`לדחות את "${t.restaurant_name}"? סיבה (לא חובה):`, '');
    if (reason === null) return;
    setBusyId(t.id);
    try {
      await base44.functions.rejectTenant({ tenant_id: t.id, reason });
      await load();
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setBusyId(null); }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="w-6 h-6 text-amber-600" /> מסעדות ממתינות לאישור
        </h1>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ml-1 ${loading ? 'animate-spin' : ''}`} /> רענן
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : tenants.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-slate-500">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-400 mb-2" />
            אין בקשות ממתינות. כל הבקשות אושרו או נדחו.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tenants.map(t => (
            <Card key={t.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building className="w-5 h-5 text-amber-600" />
                  {t.restaurant_name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  <div><strong>בעלים:</strong> {t.owner_name}</div>
                  <div className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-slate-400" /> {t.owner_phone}</div>
                  <div className="flex items-center gap-1"><Mail className="w-3.5 h-3.5 text-slate-400" /> {t.owner_email}</div>
                  <div><strong>סלוג:</strong> <code className="bg-slate-100 px-1.5 py-0.5 rounded">{t.slug}</code></div>
                  <div className="md:col-span-2"><strong>כתובת אחרי אישור:</strong> <a href={t.subdomain_url} className="text-blue-600 underline">{t.subdomain_url}</a></div>
                </div>
                <div className="flex gap-2 pt-2 border-t mt-3">
                  <Button
                    size="sm"
                    onClick={() => approve(t)}
                    disabled={busyId === t.id}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {busyId === t.id ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <CheckCircle2 className="w-4 h-4 ml-1" />}
                    אשר ותתקן
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => reject(t)}
                    disabled={busyId === t.id}
                    className="text-red-600 border-red-300 hover:bg-red-50"
                  >
                    <X className="w-4 h-4 ml-1" /> דחה
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PlatformAdminPending() {
  return (
    <PageGuard pageName="PlatformAdminPending" pageTitle="ממתינות לאישור">
      <PendingApprovalInner />
    </PageGuard>
  );
}
