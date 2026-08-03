import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import PageGuard from '@/components/shared/PageGuard';
import PageHeader from '@/components/shared/PageHeader';
import TimePicker from '@/components/shared/TimePicker';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Bell, Clock, Pencil, RotateCcw, Zap, Hand, AlarmClock, Loader2 } from 'lucide-react';

const DOW = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']; // Sun..Sat

const KIND_CHIP = {
  cron: { icon: AlarmClock, label: 'מתוזמן', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  event: { icon: Zap, label: 'אירוע', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  action: { icon: Hand, label: 'פעולה שלך', cls: 'bg-stone-100 text-stone-600 border-stone-200' },
};

const canToggle = (item) => item.gateable !== false && item.kind !== 'action';

function NotificationSettingsInner() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(null); // the item being text-edited

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.getNotificationSettings({});
      const payload = res?.data || res || {};
      setGroups(payload.groups || []);
    } catch (e) {
      setMessage('שגיאה בטעינת ההגדרות');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const flash = (t) => { setMessage(t); setTimeout(() => setMessage(''), 2500); };

  // Update one item in local state without a full refetch.
  const patchLocal = (key, patch) => {
    setGroups((gs) => gs.map((g) => ({
      ...g,
      items: g.items.map((it) => (it.key === key ? { ...it, ...patch } : it)),
    })));
  };

  const save = async (key, body, localPatch, okMsg) => {
    setBusyKey(key);
    try {
      await base44.functions.setNotificationSetting({ key, ...body });
      if (localPatch) patchLocal(key, localPatch);
      if (okMsg) flash(okMsg);
    } catch (e) {
      flash('שמירה נכשלה ❌');
      load();
    } finally {
      setBusyKey(null);
    }
  };

  const resetOne = async (key) => {
    setBusyKey(key);
    try {
      await base44.functions.resetNotificationSetting({ key });
      flash('אופס לברירת מחדל ↩️');
      await load();
    } catch (e) {
      flash('איפוס נכשל ❌');
    } finally {
      setBusyKey(null);
    }
  };

  const onToggle = (item, val) =>
    save(item.key, { enabled: val },
      { enabled: val, overridden: { ...item.overridden, enabled: true } },
      val ? 'ההודעה הופעלה' : 'ההודעה כובתה');

  const onTimeChange = (item, time) =>
    save(item.key, { schedule_json: { time } },
      { schedule: { time }, overridden: { ...item.overridden, schedule: true } },
      'השעה נשמרה');

  const onSlotChange = (item, dow, time) => {
    const slots = { ...(item.schedule?.slots || item.defaultSchedule?.slots || {}), [String(dow)]: time };
    save(item.key, { schedule_json: { slots } },
      { schedule: { slots }, overridden: { ...item.overridden, schedule: true } },
      'השעה נשמרה');
  };

  // "Send X minutes after the trigger" — persisted to team_nudges (not the
  // NotificationSetting row), so it uses a dedicated fn instead of `save`.
  const onDelayChange = async (item, minutes) => {
    const dc = item.delayConfig || {};
    const val = Math.max(dc.min ?? 1, Math.min(dc.max ?? 180, Math.round(Number(minutes) || 0)));
    patchLocal(item.key, { delay_min: val }); // optimistic
    setBusyKey(item.key);
    try {
      const res = await base44.functions.setNotificationDelay({ key: item.key, delay_min: val });
      const saved = (res?.data || res || {}).delay_min;
      if (Number.isFinite(saved)) patchLocal(item.key, { delay_min: saved });
      flash('הזמן נשמר ⏱️');
    } catch (e) {
      flash('שמירה נכשלה ❌');
      load();
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-3 py-6" dir="rtl">
      <PageHeader
        icon={Bell}
        title="התראות וואטסאפ"
        subtitle="כל ההודעות שהמערכת שולחת — כבה מה שלא צריך, שנה נוסח או שעה"
      />

      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        כל שינוי נשמר מיד. מה שלא נגעת בו — נשאר בדיוק כמו שהוא היום. אפשר תמיד לאפס הודעה לברירת המחדל.
      </div>

      {message && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-full bg-stone-900 text-white text-sm px-4 py-2 shadow-lg">
          {message}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-stone-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="mt-5 space-y-7">
          {groups.map((g) => (
            <section key={g.audience}>
              <div className="flex items-baseline gap-2 mb-2 border-r-4 border-[#A04A2E] pr-3">
                <h2 className="text-lg font-bold text-stone-800">{g.label}</h2>
                <span className="text-xs text-stone-400 font-semibold">{g.items.length} הודעות</span>
              </div>
              <div className="space-y-2.5">
                {g.items.map((item) => (
                  <NotifCard
                    key={item.key}
                    item={item}
                    busy={busyKey === item.key}
                    onToggle={onToggle}
                    onTimeChange={onTimeChange}
                    onSlotChange={onSlotChange}
                    onDelayChange={onDelayChange}
                    onEdit={() => setEditing(item)}
                    onReset={() => resetOne(item.key)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <EditTextDialog
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            patchLocal(editing.key, {
              custom_text: text || null,
              overridden: { ...editing.overridden, text: !!text },
            });
            flash('הטקסט נשמר ✅');
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function NotifCard({ item, busy, onToggle, onTimeChange, onSlotChange, onDelayChange, onEdit, onReset }) {
  const [delayDraft, setDelayDraft] = useState(null); // local while typing; null = show saved value
  const delayVal = item.delay_min ?? item.delayConfig?.default ?? 0;
  const chip = KIND_CHIP[item.kind] || KIND_CHIP.event;
  const ChipIcon = chip.icon;
  const toggleable = canToggle(item);
  const overridden = item.overridden && (item.overridden.enabled || item.overridden.text || item.overridden.schedule);
  const off = toggleable && !item.enabled;

  // The text the recipient actually gets right now (owner override or default).
  const effectiveText = item.custom_text || item.defaultText || '';

  return (
    <Card className={`p-4 border-r-[3px] transition-colors ${off ? 'opacity-60 border-r-stone-300' : 'border-r-[#A04A2E]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-stone-800">{item.label}</span>
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold border rounded-full px-2 py-0.5 ${chip.cls}`}>
              <ChipIcon className="w-3 h-3" /> {chip.label}
            </span>
            {item.overridden?.text && (
              <span className="text-[11px] text-[#A04A2E] font-semibold">✎ נוסח מותאם</span>
            )}
          </div>
          <p className="text-xs text-stone-500 mt-0.5">{item.description}</p>
        </div>

        {toggleable ? (
          <div className="flex items-center gap-2 shrink-0">
            {busy && <Loader2 className="w-4 h-4 animate-spin text-stone-300" />}
            <Switch checked={!!item.enabled} onCheckedChange={(v) => onToggle(item, v)} disabled={busy} />
          </div>
        ) : (
          <span className="text-[11px] text-stone-400 border border-stone-200 rounded-full px-2 py-0.5 shrink-0 whitespace-nowrap">
            תמיד פעיל
          </span>
        )}
      </div>

      {/* Current message text (for text-bearing messages) */}
      {item.textEditability !== 'none' && effectiveText && !off && (
        <div className="mt-3 rounded-lg bg-[#F3F7EC] border border-[#D9E7C4] text-[13px] text-[#33461f] whitespace-pre-wrap px-3 py-2 leading-relaxed">
          {effectiveText}
        </div>
      )}

      {/* Delay editor — "send X minutes after the trigger" (e.g. shift start) */}
      {!off && item.delayConfig && (
        <div className="mt-3 flex items-center gap-2 flex-wrap text-sm text-stone-600">
          <Clock className="w-4 h-4 text-stone-400" />
          <span>נשלחת</span>
          <div className="inline-flex items-center rounded-lg border border-stone-200 overflow-hidden">
            <button
              type="button"
              className="px-2.5 py-1 text-stone-500 hover:bg-stone-100 disabled:opacity-40 text-base leading-none"
              onClick={() => { setDelayDraft(null); onDelayChange(item, delayVal - 5); }}
              disabled={busy || delayVal <= item.delayConfig.min}
              aria-label="פחות"
            >−</button>
            <input
              type="number"
              className="w-14 text-center py-1 text-sm font-semibold text-stone-800 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              value={delayDraft ?? delayVal}
              min={item.delayConfig.min}
              max={item.delayConfig.max}
              onChange={(e) => setDelayDraft(e.target.value)}
              onBlur={(e) => { setDelayDraft(null); onDelayChange(item, e.target.value); }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            />
            <button
              type="button"
              className="px-2.5 py-1 text-stone-500 hover:bg-stone-100 disabled:opacity-40 text-base leading-none"
              onClick={() => { setDelayDraft(null); onDelayChange(item, delayVal + 5); }}
              disabled={busy || delayVal >= item.delayConfig.max}
              aria-label="עוד"
            >+</button>
          </div>
          <span>דקות אחרי תחילת המשמרת</span>
          {busy && <Loader2 className="w-4 h-4 animate-spin text-stone-300" />}
        </div>
      )}

      {/* Schedule editor */}
      {!off && item.scheduleShape === 'time' && (
        <div className="mt-3 flex items-center gap-2 text-sm text-stone-600">
          <Clock className="w-4 h-4 text-stone-400" />
          <span>שעת שליחה:</span>
          <TimePicker
            value={item.schedule?.time || item.defaultSchedule?.time || '09:00'}
            onChange={(v) => onTimeChange(item, v)}
            size="sm"
          />
        </div>
      )}
      {!off && item.scheduleShape === 'slots' && (
        <div className="mt-3">
          <div className="flex items-center gap-1.5 text-sm text-stone-600 mb-1.5">
            <Clock className="w-4 h-4 text-stone-400" /> שעת שליחה לכל יום:
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DOW.map((d, dow) => (
              <div key={dow} className="flex items-center gap-1.5">
                <span className="text-xs text-stone-500 w-5">{d}</span>
                <TimePicker
                  value={(item.schedule?.slots || item.defaultSchedule?.slots || {})[String(dow)] || '00:00'}
                  onChange={(v) => onSlotChange(item, dow, v)}
                  size="sm"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {item.note && (
        <p className="mt-2 text-[11px] text-stone-400">ℹ️ {item.note}</p>
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2">
        {item.textEditability !== 'none' && (
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onEdit} disabled={busy}>
            <Pencil className="w-3.5 h-3.5" /> ערוך טקסט
          </Button>
        )}
        {overridden && (
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-stone-500" onClick={onReset} disabled={busy}>
            <RotateCcw className="w-3.5 h-3.5" /> אפס לברירת מחדל
          </Button>
        )}
      </div>
    </Card>
  );
}

function EditTextDialog({ item, onClose, onSaved }) {
  const [draft, setDraft] = useState(item.custom_text || item.defaultText || '');
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const taRef = useRef(null);

  const refreshPreview = async (text) => {
    try {
      const res = await base44.functions.previewNotificationText({ key: item.key, custom_text: text });
      setPreview((res?.data || res || {}).preview || '');
    } catch { /* ignore */ }
  };
  useEffect(() => { refreshPreview(draft); /* eslint-disable-next-line */ }, []);

  const insertToken = (token) => {
    const ta = taRef.current;
    const ins = `{${token}}`;
    if (ta && typeof ta.selectionStart === 'number') {
      const s = ta.selectionStart, e = ta.selectionEnd;
      const next = draft.slice(0, s) + ins + draft.slice(e);
      setDraft(next);
      setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = s + ins.length; }, 0);
    } else {
      setDraft((d) => d + ins);
    }
  };

  const doSave = async () => {
    setSaving(true);
    try {
      await base44.functions.setNotificationSetting({ key: item.key, custom_text: draft });
      onSaved(draft);
    } catch {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{item.label} — עריכת נוסח</DialogTitle>
        </DialogHeader>

        {item.textEditability === 'meta_reapproval' && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2">
            זו תבנית מאושרת של Meta. נוסח חדש עובר בדיקה (24–72 שעות) ובינתיים נשלח כ-SMS.
          </div>
        )}

        {item.variables?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-stone-500 self-center">הוסף שדה:</span>
            {item.variables.map((v) => (
              <button
                key={v.token}
                type="button"
                onClick={() => insertToken(v.token)}
                className="text-[11px] bg-[#FBEFE9] text-[#A04A2E] border border-[#EAD5CB] rounded-full px-2 py-0.5 hover:bg-[#f6e2d8]"
              >
                {v.label} ({'{' + v.token + '}'})
              </button>
            ))}
          </div>
        )}

        <Textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={7}
          dir="rtl"
          className="text-sm leading-relaxed"
        />

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-stone-500">תצוגה מקדימה (עם נתונים לדוגמה):</span>
            <button type="button" className="text-xs text-[#A04A2E]" onClick={() => refreshPreview(draft)}>רענן</button>
          </div>
          <div className="rounded-lg bg-[#F3F7EC] border border-[#D9E7C4] text-[13px] text-[#33461f] whitespace-pre-wrap px-3 py-2 min-h-[3rem] leading-relaxed">
            {preview || '—'}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>ביטול</Button>
          <Button onClick={doSave} disabled={saving} className="bg-[#A04A2E] hover:bg-[#7A3722] text-white gap-1.5">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} שמור נוסח
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function NotificationSettings() {
  return (
    <PageGuard pageName="NotificationSettings" pageTitle="התראות וואטסאפ">
      <NotificationSettingsInner />
    </PageGuard>
  );
}
