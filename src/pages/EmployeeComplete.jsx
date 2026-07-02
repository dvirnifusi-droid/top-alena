import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { invokePublic } from '@/lib/publicFetch';
import { useTenantBranding } from '@/hooks/useTenantBranding';

export default function EmployeeComplete() {
  const [search] = useSearchParams();
  const token = search.get('t') || '';
  const branding = useTenantBranding();
  const brand = branding?.name || 'המסעדה';
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!token) { setError('קישור לא תקין'); return; }
    if (!email || !role) { setError('כל השדות חובה'); return; }
    setSubmitting(true);
    setError(null);
    try {
      await invokePublic('completeEmployeeInvitation', { token, email, role });
      setDone(true);
    } catch (err) {
      setError(err?.message || 'שגיאה');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-3">
            <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
            <h2 className="text-xl font-bold">ברוך הבא לצוות {brand}!</h2>
            <p className="text-sm text-slate-600">
              הפרטים שלך נשמרו. המנהל יצור איתך קשר עם קוד גישה למערכת.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <Card className="max-w-md w-full">
        <CardContent className="p-6 space-y-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold">הצטרפו לצוות {brand} 🌿</h1>
            <p className="text-sm text-slate-500 mt-1">רק שני פרטים ואתה בפנים</p>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label>אימייל *</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="mt-1" />
            </div>
            <div>
              <Label>תפקיד *</Label>
              <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="מלצר / טבח / ברמן / מנהל..." className="mt-1" />
            </div>
            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">⚠️ {error}</div>}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
              שלח
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
