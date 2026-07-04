// Public self-signup page for new team members. One generic link per
// restaurant (https://<slug>.topalena.com/JoinTeam) — the owner shares it
// in the staff WhatsApp group, each employee fills their own details and
// lands in ניהול עובדים as "ממתין לאישור". No token needed: the tenant is
// identified by the subdomain the page is served from.
import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, Users } from 'lucide-react';
import { invokePublic } from '@/lib/publicFetch';
import { useTenantBranding } from '@/hooks/useTenantBranding';

export default function JoinTeam() {
  const branding = useTenantBranding();
  const brand = branding?.name || 'המסעדה';
  const [roles, setRoles] = useState([]);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    invokePublic('getJoinTeamInfo', {})
      .then((res) => setRoles((res?.data || res)?.roles || []))
      .catch(() => setRoles(['מלצר/ית', 'טבח/ית', 'ברמן/ית', 'אחמ"ש']));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim() || !email.trim() || !role) {
      setError('כל השדות חובה');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await invokePublic('joinTeamRequest', {
        full_name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        role,
      });
      setDone(true);
    } catch (err) {
      setError(err?.message || 'שגיאה — נסה שוב');
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
            <h2 className="text-xl font-bold">הבקשה נשלחה! 🎉</h2>
            <p className="text-sm text-slate-600">
              המנהל של {brand} קיבל התראה ויאשר אותך בקרוב.
              ברגע שתאושר — תקבל וואטסאפ עם פרטי הכניסה שלך למערכת.
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
            <Users className="w-10 h-10 mx-auto text-[#44512C]" />
            <h1 className="text-2xl font-bold mt-2">הצטרפו לצוות {brand} 🌿</h1>
            <p className="text-sm text-slate-500 mt-1">מלא את הפרטים והמנהל יאשר אותך</p>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label>שם מלא</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="ישראל ישראלי" />
            </div>
            <div>
              <Label>טלפון (וואטסאפ)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="050-1234567" dir="ltr" className="text-right" />
            </div>
            <div>
              <Label>מייל</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="me@gmail.com" dir="ltr" className="text-right" />
            </div>
            <div>
              <Label>תפקיד</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {roles.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`p-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                      role === r ? 'border-[#44512C] bg-[#F4ECD8]' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={submitting} className="w-full bg-[#44512C] hover:bg-[#37421f]">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שלח בקשת הצטרפות'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
