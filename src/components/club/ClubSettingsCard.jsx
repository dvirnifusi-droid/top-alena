import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Loader2, Gift, Gamepad2, Save } from 'lucide-react';

// The two numbers that decide what club membership is worth, in one place the
// owner can reach. They are defaults, not decisions baked into the code — the
// welcome benefit and the game payout both cost real money, and that is the
// owner's call to make and to change once he sees what it does to footfall.
export default function ClubSettingsCard() {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await base44.functions.getClubSettings();
        setS((r?.data ?? r)?.settings || null);
      } catch { setS(null); }
    })();
  }, []);

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      const r = await base44.functions.saveClubSettings({ settings: s });
      setS((r?.data ?? r)?.settings || s);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { /* the button returning to rest is the failure signal */ }
    setSaving(false);
  };

  if (!s) return null;
  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));

  return (
    <Card className="mb-6">
      <CardContent className="p-5 space-y-5">
        <div>
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Gift className="w-4 h-4 text-amber-600" /> מה מקבל מי שמצטרף
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            ההטבה ניתנת אוטומטית בהרשמה, עם קוד שהמלצר מסמן ב"מימוש הטבת מועדון".
          </p>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-700">הטבת הצטרפות פעילה</span>
          <Switch checked={s.welcome_enabled} onCheckedChange={(v) => set('welcome_enabled', v)} />
        </div>

        {s.welcome_enabled && (
          <div className="space-y-3 pr-1">
            <div>
              <label className="text-xs text-slate-500">נוסח ההטבה — זה מה שהלקוח והמלצר רואים</label>
              <Input value={s.welcome_text} onChange={(e) => set('welcome_text', e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-slate-500">תוקף (ימים)</label>
              <Input type="number" min={1} value={s.welcome_valid_days}
                onChange={(e) => set('welcome_valid_days', e.target.value)} className="mt-1 w-28" />
            </div>
          </div>
        )}

        <div className="pt-4 border-t">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Gamepad2 className="w-4 h-4 text-indigo-600" /> תשלום על משחק בתור
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 mb-3">
            מטבעות שנצברים על סיום משחק ונכנסים ליתרה כשהלקוח מתיישב. מטבע = ₪4 בשווי מימוש.
          </p>
          <div className="flex items-center gap-2">
            <Input type="number" min={0} value={s.game_coins}
              onChange={(e) => set('game_coins', e.target.value)} className="w-28" />
            <span className="text-sm text-slate-500">
              מטבעות = ₪{(Number(s.game_coins) || 0) * 4} ללקוח
            </span>
          </div>
        </div>

        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" />
            : saved ? '✓ נשמר' : <><Save className="w-4 h-4 ml-1" /> שמירה</>}
        </Button>
      </CardContent>
    </Card>
  );
}
