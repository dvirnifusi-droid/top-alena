import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Crown, CheckCircle2, ChefHat } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function Signup() {
  const [form, setForm] = useState({
    restaurant_name: '', owner_name: '', owner_phone: '', owner_email: '', slug: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  const update = (k, v) => setForm(s => ({ ...s, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.restaurant_name || !form.owner_name || !form.owner_phone || !form.owner_email || !form.slug) {
      setError('כל השדות חובה');
      return;
    }
    setSubmitting(true);
    try {
      const res = await base44.asServiceRole.functions.requestTenantSignup(form);
      const data = res?.data || res;
      setSuccess(data);
    } catch (err) {
      setError(err?.message || 'שגיאה לא ידועה');
    } finally { setSubmitting(false); }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-amber-50 to-orange-100" dir="rtl">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-3">
            <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
            <h2 className="text-xl font-bold">בקשתך נקלטה!</h2>
            <p className="text-sm text-slate-600">
              המנהל יבדוק את הפרטים ויאשר תוך 24 שעות. אחרי האישור — תקבל וואטסאפ עם הכתובת שלך:
            </p>
            <code className="block bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm font-bold text-amber-900">
              https://{form.slug}.topalena.com
            </code>
            <p className="text-xs text-slate-500">
              בכל שאלה — צרי קשר בוואטסאפ.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 bg-gradient-to-br from-amber-50 to-orange-100" dir="rtl">
      <div className="max-w-md mx-auto py-8 space-y-4">
        <div className="text-center">
          <div className="inline-flex items-center justify-center bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-full p-4 mb-3">
            <ChefHat className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold">הצטרפו ל-TopAlena</h1>
          <p className="text-sm text-slate-600 mt-1">
            מערכת ניהול מסעדה מבוססת AI — סידור עבודה, מלאי, תזרים, וואטסאפ אישי, והכל מ-מקום אחד.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-600" /> פרטי המסעדה
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <Label className="text-xs">שם המסעדה *</Label>
                <Input value={form.restaurant_name} onChange={(e) => update('restaurant_name', e.target.value)} placeholder="לדוגמה: מסעדת השף" />
              </div>
              <div>
                <Label className="text-xs">תת-דומיין (סלוג) *</Label>
                <div className="flex items-center gap-1 text-sm">
                  <Input value={form.slug} onChange={(e) => update('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="restaurant1" />
                  <span className="text-slate-500 whitespace-nowrap">.topalena.com</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">אותיות אנגליות, מספרים ומקפים. הכתובת שלך תהיה: <code>{form.slug || 'restaurant1'}.topalena.com</code></p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label className="text-xs">שם הבעלים *</Label>
                  <Input value={form.owner_name} onChange={(e) => update('owner_name', e.target.value)} placeholder="שם מלא" />
                </div>
                <div>
                  <Label className="text-xs">טלפון (וואטסאפ) *</Label>
                  <Input value={form.owner_phone} onChange={(e) => update('owner_phone', e.target.value)} placeholder="050-1234567" />
                </div>
                <div>
                  <Label className="text-xs">אימייל *</Label>
                  <Input type="email" value={form.owner_email} onChange={(e) => update('owner_email', e.target.value)} placeholder="owner@restaurant.com" />
                </div>
              </div>
              {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">⚠️ {error}</div>}
              <Button type="submit" disabled={submitting} className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
                שלח בקשה
              </Button>
              <p className="text-xs text-slate-500 text-center">
                שליחת הבקשה לא מחייבת ואינה כרוכה בתשלום.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
