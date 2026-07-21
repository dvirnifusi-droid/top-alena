import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Gift, Gamepad2, Save, Trophy, MessageSquare } from 'lucide-react';

// The two numbers that decide what club membership is worth, in one place the
// owner can reach. They are defaults, not decisions baked into the code — the
// welcome benefit and the game payout both cost real money, and that is the
// owner's call to make and to change once he sees what it does to footfall.
// Read the real message on a real phone before nineteen thousand people can.
// Sends with a live signed card link rather than a mock — a preview that fakes
// the link is exactly where a broken link would hide.
function JoinMessageTester() {
  const [phone, setPhone] = useState('');
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true); setState(null);
    try {
      const r = await base44.functions.clubTestJoinMessage({ phone: phone.trim() });
      const d = (r?.data ?? r) || {};
      setState(d.sent ? 'נשלח — תבדוק בוואטסאפ' : `לא נשלח (${d.reason || 'שגיאה'})`);
    } catch (e) {
      setState(e?.message || 'שגיאה בשליחה');
    }
    setBusy(false);
  };

  return (
    <div className="mt-3 flex items-center gap-2">
      <Input value={phone} onChange={(e) => setPhone(e.target.value)}
        placeholder="מספר לבדיקה" className="text-sm" />
      <Button variant="outline" onClick={send} disabled={busy || phone.trim().length < 9} className="shrink-0">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שלח לי לבדיקה'}
      </Button>
      {state && <span className="text-xs text-slate-500 shrink-0">{state}</span>}
    </div>
  );
}

// Ending a round gives away food, so it is two steps and never a timer: see who
// won, then decide. The owner asked that the app stop acting on its own
// schedule, and this is exactly the kind of thing he meant.
function TournamentCloser() {
  const [preview, setPreview] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  const look = async () => {
    setBusy(true); setDone(null);
    try {
      const r = await base44.functions.clubTournamentPreview();
      setPreview((r?.data ?? r) || null);
    } catch { setPreview(null); }
    setBusy(false);
  };

  const award = async () => {
    setBusy(true);
    try {
      const r = await base44.functions.clubTournamentClose();
      setDone((r?.data ?? r) || null);
      setPreview(null);
    } catch { /* the button coming back to rest is the signal */ }
    setBusy(false);
  };

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4">
        <p className="font-bold text-emerald-800 text-sm mb-2">הפרסים חולקו · סבב חדש התחיל</p>
        {(done.winners || []).map((w) => (
          <p key={w.rank} className="text-sm text-slate-700">
            {w.rank}. {w.name} — קוד <span className="font-black tracking-wider">{w.code}</span>
          </p>
        ))}
        <p className="text-xs text-slate-500 mt-2">הקודים מופיעים גם בכרטיס החבר של כל זוכה.</p>
      </div>
    );
  }

  if (preview) {
    const winners = preview.winners || [];
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
        {winners.length === 0 ? (
          <>
            <p className="text-sm text-slate-700">אף אחד לא שיחק בסבב הזה — אין למי להעניק.</p>
            <Button variant="ghost" onClick={() => setPreview(null)} className="w-full mt-2 text-slate-500">סגירה</Button>
          </>
        ) : (
          <>
            <p className="font-bold text-amber-900 text-sm mb-2">אלה הזוכים — לאשר?</p>
            {winners.map((w) => (
              <p key={w.rank} className="text-sm text-slate-700">
                {w.rank}. {w.name} — {w.points} נקודות
              </p>
            ))}
            <p className="text-xs text-slate-600 mt-2">כל אחד יקבל: {preview.prize}</p>
            <Button onClick={award} disabled={busy} className="w-full mt-3 bg-emerald-600 hover:bg-emerald-700">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'להעניק ולפתוח סבב חדש'}
            </Button>
            <Button variant="ghost" onClick={() => setPreview(null)} className="w-full mt-1 text-slate-500">ביטול</Button>
          </>
        )}
      </div>
    );
  }

  return (
    <Button variant="outline" onClick={look} disabled={busy} className="w-full">
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'לסגור סבב ולחלק פרסים'}
    </Button>
  );
}

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
            🎂 הטבת יום הולדת
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 mb-3">
            ביום ההולדת של חבר מועדון נשלחת ברכה עם קוד הטבה אמיתי לממש (פעם בשנה, תוקף 30 יום). דורש שהדיוורים דלוקים.
          </p>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-slate-700">הטבת יום הולדת פעילה</span>
            <Switch checked={!!s.birthday_enabled} onCheckedChange={(v) => set('birthday_enabled', v)} />
          </div>
          {s.birthday_enabled && (
            <div>
              <label className="text-xs text-slate-500">נוסח ההטבה — זה מה שהלקוח והמלצר רואים</label>
              <Input value={s.birthday_text || ''} onChange={(e) => set('birthday_text', e.target.value)} className="mt-1" />
            </div>
          )}
        </div>

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

        <div className="pt-4 border-t">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-emerald-600" /> ההודעה שנשלחת בהצטרפות
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 mb-3">
            נשלחת בוואטסאפ למי שנרשם ואישר דיוור, עם ההטבה, הקוד והקישור לכרטיס.
            בלי זה אף אחד לא יודע שיש לו כרטיס.
          </p>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-slate-700">שליחה בהצטרפות</span>
            <Switch checked={s.join_message_enabled} onCheckedChange={(v) => set('join_message_enabled', v)} />
          </div>
          {s.join_message_enabled && (
            <>
              <Textarea rows={6} value={s.join_message_text}
                onChange={(e) => set('join_message_text', e.target.value)} className="text-sm" />
              <p className="text-[11px] text-slate-400 mt-1">
                {'{name} · {brand} · {benefit} · {code} · {card}'}
              </p>
              <JoinMessageTester />
            </>
          )}
        </div>

        <div className="pt-4 border-t">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-600" /> טורניר המועדון
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 mb-3">
            כל חבר מועדון יכול לשחק מכל מקום. נקודות לא עולות לך כלום — רק הפרס למובילים עולה,
            ולכן העלות שלך קבועה מראש בלי קשר לכמה שיחקו.
          </p>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-slate-700">טורניר פעיל</span>
            <Switch checked={s.tournament_enabled} onCheckedChange={(v) => set('tournament_enabled', v)} />
          </div>
          {s.tournament_enabled && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500">הפרס למובילים</label>
                <Input value={s.tournament_prize} onChange={(e) => set('tournament_prize', e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-slate-500">כמה זוכים</label>
                <Input type="number" min={1} value={s.tournament_winners}
                  onChange={(e) => set('tournament_winners', e.target.value)} className="mt-1 w-24" />
              </div>
              <div>
                <label className="text-xs text-slate-500">
                  משחק במסעדה שווה פי כמה נקודות
                </label>
                <div className="flex items-center gap-2 mt-1">
                  <Input type="number" min={1} value={s.queue_multiplier}
                    onChange={(e) => set('queue_multiplier', e.target.value)} className="w-24" />
                  <span className="text-xs text-slate-500">
                    כדי שהטורניר יתגמל את מי שמגיע, לא את מי שנשאר בבית
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {s.tournament_enabled && <TournamentCloser />}

        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" />
            : saved ? '✓ נשמר' : <><Save className="w-4 h-4 ml-1" /> שמירה</>}
        </Button>
      </CardContent>
    </Card>
  );
}
