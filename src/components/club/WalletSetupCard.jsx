import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Wallet, CheckCircle2, AlertTriangle, ChevronDown } from 'lucide-react';

// Putting the club card into Apple Wallet and Google Wallet.
//
// Deliberately collapsed by default. This is a once-a-year task involving
// certificates, and it should not sit open in the middle of the screen a
// restaurant owner uses every day.
const APPLE_FIELDS = [
  { key: 'APPLE_PASS_TYPE_ID', label: 'Pass Type ID', hint: 'למשל pass.com.alena.club', lines: 1 },
  { key: 'APPLE_TEAM_ID', label: 'Team ID', hint: '10 תווים מחשבון המפתחים', lines: 1 },
  { key: 'APPLE_PASS_CERT_PEM', label: 'תעודת החתימה (PEM)', hint: 'מתחיל ב-BEGIN CERTIFICATE', lines: 4 },
  { key: 'APPLE_PASS_KEY_PEM', label: 'המפתח הפרטי (PEM)', hint: 'מתחיל ב-BEGIN PRIVATE KEY', lines: 4 },
  { key: 'APPLE_WWDR_PEM', label: 'תעודת הביניים של אפל (WWDR)', hint: 'מורידים מאתר אפל', lines: 4 },
];
const GOOGLE_FIELDS = [
  { key: 'GOOGLE_WALLET_ISSUER_ID', label: 'Issuer ID', hint: 'מחשבון Google Wallet', lines: 1 },
  { key: 'GOOGLE_WALLET_SA_EMAIL', label: 'Service account email', hint: 'xxx@yyy.iam.gserviceaccount.com', lines: 1 },
  { key: 'GOOGLE_WALLET_SA_KEY', label: 'Service account private key', hint: 'שדה private_key מקובץ ה-JSON', lines: 4 },
];

export default function WalletSetupCard() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null);
  const [vals, setVals] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = () => base44.functions.getWalletSetup()
    .then(r => setState((r?.data ?? r) || null))
    .catch(() => setState(null));

  useEffect(() => { load(); }, []);
  if (!state) return null;

  const { availability: a, expiry } = state;
  const set = (k, v) => setVals(p => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      const r = await base44.functions.saveWalletSecrets({ secrets: vals });
      const d = (r?.data ?? r) || {};
      setState({ availability: d.availability, expiry: d.expiry });
      setVals({});
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* button returning to rest is the signal */ }
    setSaving(false);
  };

  const Field = ({ f }) => (
    <div>
      <label className="text-xs text-slate-500">{f.label}</label>
      {f.lines > 1 ? (
        <Textarea rows={f.lines} value={vals[f.key] || ''} placeholder={f.hint}
          onChange={e => set(f.key, e.target.value)} className="mt-1 text-xs font-mono" />
      ) : (
        <Input value={vals[f.key] || ''} placeholder={f.hint}
          onChange={e => set(f.key, e.target.value)} className="mt-1 text-sm" />
      )}
    </div>
  );

  return (
    <Card className="mb-6">
      <CardContent className="p-5">
        <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-right">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-slate-600" /> כרטיס המועדון בארנק הטלפון
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {a.apple || a.google
                ? `פעיל: ${[a.apple && 'Apple Wallet', a.google && 'Google Wallet'].filter(Boolean).join(' · ')}`
                : 'לא מוגדר — צריך חשבון Apple Developer ו/או Google Cloud'}
            </p>
          </div>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {/* The alarm that matters. When the Apple certificate lapses, every
            customer's pass stops working on the same day and nothing announces
            it — so it is shown before anything else, even when collapsed. */}
        {expiry?.days_left != null && expiry.days_left < 45 && (
          <div className={`mt-3 rounded-xl p-3 text-sm flex items-start gap-2 ${
            expiry.days_left < 0 ? 'bg-red-50 border border-red-300' : 'bg-amber-50 border border-amber-300'}`}>
            <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${expiry.days_left < 0 ? 'text-red-600' : 'text-amber-600'}`} />
            <div>
              <p className="font-bold text-slate-800">
                {expiry.days_left < 0
                  ? 'תעודת אפל פגה — הכרטיסים של כל הלקוחות לא עובדים'
                  : `תעודת אפל פגה בעוד ${expiry.days_left} ימים`}
              </p>
              <p className="text-slate-600 text-xs mt-0.5">
                צריך להנפיק תעודה חדשה בחשבון המפתחים ולהדביק אותה כאן. ביום שהיא פגה,
                כל הכרטיסים מפסיקים לעבוד יחד.
              </p>
            </div>
          </div>
        )}

        {open && (
          <div className="mt-5 space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {a.apple ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                         : <span className="w-4 h-4 rounded-full border-2 border-slate-300 inline-block" />}
                <span className="font-bold text-sm text-slate-800">Apple Wallet</span>
                {expiry?.expires && (
                  <span className="text-xs text-slate-400">
                    תעודה בתוקף עד {new Date(expiry.expires).toLocaleDateString('he-IL')}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mb-3">
                דורש חשבון Apple Developer (99$ לשנה) ותעודת Pass Type ID שמונפקת בתוכו.
              </p>
              <div className="space-y-3">{APPLE_FIELDS.map(f => <Field key={f.key} f={f} />)}</div>
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center gap-2 mb-2">
                {a.google ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          : <span className="w-4 h-4 rounded-full border-2 border-slate-300 inline-block" />}
                <span className="font-bold text-sm text-slate-800">Google Wallet</span>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                דורש חשבון Google Cloud ו-Issuer ID. בחינם.
              </p>
              <div className="space-y-3">{GOOGLE_FIELDS.map(f => <Field key={f.key} f={f} />)}</div>
            </div>

            <Button onClick={save} disabled={saving || Object.keys(vals).length === 0} className="w-full">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? '✓ נשמר' : 'שמירה'}
            </Button>
            <p className="text-[11px] text-slate-400 text-center">
              שדה שנשאר ריק לא משנה את מה שכבר שמור.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
