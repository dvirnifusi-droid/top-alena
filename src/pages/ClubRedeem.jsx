import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, CheckCircle2, XCircle, Gift, AlertTriangle } from 'lucide-react';

// Where a club benefit stops being a number on a screen.
//
// The club could issue benefits long before it could honour one — there was no
// way for a waiter to check a code or mark it used, which is the difference
// between a loyalty club and a promise. Two steps on purpose: look up first, see
// what you are about to give away and to whom, then hand it over. A single
// button would burn a valid code on a mistyped digit.
export default function ClubRedeem() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const reset = () => { setCode(''); setFound(null); setResult(null); setError(''); };

  const lookup = async () => {
    const c = code.trim().toUpperCase();
    if (c.length < 4) return;
    setBusy(true); setError(''); setFound(null); setResult(null);
    try {
      const r = await base44.functions.clubLookupBenefit({ code: c });
      const d = r?.data ?? r ?? {};
      if (!d.found) setError('לא נמצאה הטבה עם הקוד הזה');
      else setFound(d);
    } catch (e) {
      setError(e?.message || 'שגיאה בבדיקת הקוד');
    }
    setBusy(false);
  };

  const redeem = async () => {
    setBusy(true); setError('');
    try {
      const r = await base44.functions.clubRedeemBenefit({ code: code.trim().toUpperCase() });
      const d = r?.data ?? r ?? {};
      setResult(d);
      if (!d.ok) setFound(null);
    } catch (e) {
      setError(e?.message || 'שגיאה במימוש');
    }
    setBusy(false);
  };

  return (
    <div dir="rtl" className="p-4 md:p-8 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">מימוש הטבת מועדון</h1>
      <p className="text-sm text-slate-500 mb-6">הלקוח מציג קוד בן 6 תווים בכרטיס החבר שלו.</p>

      {!result && (
        <Card>
          <CardContent className="p-5">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && lookup()}
              placeholder="ABC123"
              autoFocus
              inputMode="text"
              autoCapitalize="characters"
              className="text-center text-3xl font-black tracking-[0.3em] h-16"
            />
            {!found && (
              <Button onClick={lookup} disabled={busy || code.length < 4} className="w-full mt-4 h-12">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'בדיקת הקוד'}
              </Button>
            )}

            {error && (
              <p className="mt-4 text-sm text-red-600 flex items-center gap-1.5">
                <XCircle className="w-4 h-4" /> {error}
              </p>
            )}

            {found && (
              <div className="mt-5">
                {found.status === 'active' ? (
                  <>
                    <div className="rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50 p-4">
                      <p className="text-xs font-bold text-emerald-700 mb-1 flex items-center gap-1.5">
                        <Gift className="w-3.5 h-3.5" /> ההטבה
                      </p>
                      <p className="font-semibold text-slate-800">{found.description}</p>
                      <p className="text-sm text-slate-600 mt-2">
                        {found.customer_name || 'לקוח'}
                        {found.customer_phone ? ` · ${found.customer_phone}` : ''}
                      </p>
                      {found.expiry_date && (
                        <p className="text-xs text-slate-500 mt-1">
                          בתוקף עד {found.expiry_date.split('-').reverse().join('/')}
                        </p>
                      )}
                    </div>
                    <Button onClick={redeem} disabled={busy} className="w-full mt-4 h-12 bg-emerald-600 hover:bg-emerald-700">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'מימשתי — סמן כנוצל'}
                    </Button>
                    <Button variant="ghost" onClick={reset} className="w-full mt-1 text-slate-500">ביטול</Button>
                  </>
                ) : (
                  // The useful part of a refusal is the detail: a waiter who can
                  // say "מומש ביום ראשון ב-20:14" settles the question at the table.
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                    <p className="font-bold text-amber-800 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      {found.status === 'expired' ? 'ההטבה פגה' : 'ההטבה כבר מומשה'}
                    </p>
                    <p className="text-sm text-slate-700 mt-1">{found.description}</p>
                    {found.redeemed_at && (
                      <p className="text-sm text-slate-600 mt-1">
                        מומשה ב-{new Date(found.redeemed_at).toLocaleString('he-IL')}
                        {found.redeemed_by ? ` על ידי ${found.redeemed_by}` : ''}
                      </p>
                    )}
                    <Button variant="outline" onClick={reset} className="w-full mt-3">קוד אחר</Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardContent className="p-8 text-center">
            {result.ok ? (
              <>
                <CheckCircle2 className="w-14 h-14 text-emerald-600 mx-auto mb-3" />
                <h2 className="text-xl font-bold text-slate-800">ההטבה מומשה</h2>
                <p className="text-slate-600 mt-1">{result.description}</p>
              </>
            ) : (
              <>
                <XCircle className="w-14 h-14 text-amber-500 mx-auto mb-3" />
                <h2 className="text-xl font-bold text-slate-800">
                  {result.reason === 'already_used' ? 'הקוד כבר מומש' :
                   result.reason === 'expired' ? 'ההטבה פגה' : 'הקוד לא נמצא'}
                </h2>
                {result.redeemed_at && (
                  <p className="text-sm text-slate-600 mt-1">
                    מומש ב-{new Date(result.redeemed_at).toLocaleString('he-IL')}
                    {result.redeemed_by ? ` על ידי ${result.redeemed_by}` : ''}
                  </p>
                )}
              </>
            )}
            <Button onClick={reset} className="w-full mt-6 h-12">קוד הבא</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
