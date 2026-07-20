import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, MessageSquare, CheckCircle2, Copy, ChevronDown } from 'lucide-react';

// Approved WhatsApp templates — the fix for two separate problems at once.
//
// Measured from the account, not assumed: SMS costs about $1.35 a message here
// (Hebrew is 70 characters a segment, so one long text billed as nine), while
// 410 of the last 996 WhatsApp messages were never delivered because free-form
// WhatsApp only reaches someone who wrote to the business in the last 24 hours.
//
// An approved template is delivered outside that window and costs a fraction of
// a shekel. The wording below is generated from the code, because a template
// whose approved text differs from what the app sends is rejected at send time.
export default function WhatsAppTemplatesCard() {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState(null);
  const [sids, setSids] = useState({});
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState('');

  const load = () => base44.functions.getWhatsAppTemplates()
    .then(r => setTemplates(((r?.data ?? r) || {}).templates || []))
    .catch(() => setTemplates(null));

  useEffect(() => { load(); }, []);
  if (!templates) return null;

  // Live means Meta-approved and actually sending over WhatsApp — not merely
  // that a SID was pasted in. A configured-but-unapproved template still sends
  // by SMS, so the count that matters is the approved one.
  const ready = templates.filter(t => t.approved).length;

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    } catch { /* clipboard blocked — the text is on screen to select by hand */ }
  };

  const save = async () => {
    setSaving(true); setNote('');
    try {
      const r = await base44.functions.saveWhatsAppTemplates({ sids });
      const d = (r?.data ?? r) || {};
      setTemplates(d.templates || templates);
      setSids({});
      setNote(d.rejected?.length
        ? `נשמרו ${d.saved}. ${d.rejected.length} נדחו — מזהה תבנית חייב להתחיל ב-HX`
        : `נשמרו ${d.saved}`);
    } catch (e) {
      setNote(e?.message || 'שגיאה בשמירה');
    }
    setSaving(false);
  };

  return (
    <Card className="mb-6">
      <CardContent className="p-5">
        <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-right">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-600" /> תבניות וואטסאפ
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {ready === templates.length
                ? 'כל התבניות מחוברות'
                : `${ready} מתוך ${templates.length} מחוברות — עד אז נשלח ב-SMS, שעולה בערך $1.35 להודעה`}
            </p>
          </div>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="mt-5 space-y-5">
            <div className="rounded-xl bg-slate-50 border p-3 text-xs text-slate-600 leading-relaxed">
              <p className="font-bold text-slate-800 mb-1">למה זה חשוב</p>
              <p>
                וואטסאפ מעביר הודעה חופשית רק תוך 24 שעות מרגע שהלקוח כתב לעסק. לקוח חדש
                מעולם לא כתב — ולכן ההודעה לא מגיעה, וטוויליו עדיין מדווחת הצלחה.
                תבנית מאושרת עוברת גם מחוץ לחלון, ועולה שבריר ממה ש-SMS עולה.
              </p>
              <p className="mt-2 font-bold text-slate-800">איך מגישים</p>
              <p>
                בקונסולת Twilio → Content Template Builder → יוצרים תבנית מסוג Text,
                מדביקים בדיוק את הנוסח שלמטה, שולחים לאישור WhatsApp. אחרי האישור מעתיקים
                את ה-Content SID (מתחיל ב-HX) לשדה כאן.
              </p>
            </div>

            {templates.map(t => (
              <div key={t.kind} className="border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                    {t.approved && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    {t.label}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {t.approved ? 'פעיל בוואטסאפ'
                      : t.configured ? 'הוזן — ממתין לאישור Meta'
                      : t.category === 'utility' ? 'Utility' : 'Marketing'}
                  </span>
                </div>

                <div className="relative">
                  <pre className="text-xs bg-slate-50 border rounded-lg p-3 whitespace-pre-wrap font-sans text-slate-700 leading-relaxed">
{t.body}
                  </pre>
                  <Button size="sm" variant="ghost" className="absolute top-1 left-1 h-7 text-[11px]"
                    onClick={() => copy(t.body, t.kind)}>
                    <Copy className="w-3 h-3 ml-1" />
                    {copied === t.kind ? 'הועתק' : 'העתק'}
                  </Button>
                </div>

                <p className="text-[11px] text-slate-400 mt-1.5">
                  {t.vars.map((v, i) => `{{${i + 1}}} = ${v}`).join(' · ')}
                </p>

                {/* Meta refuses a body that opens or closes on a variable. This
                    account already has one template rejected for exactly that,
                    and the cost of finding out is two days of waiting. */}
                {t.risk && (
                  <p className="text-[11px] text-red-600 font-bold mt-1">⚠ {t.risk}</p>
                )}

                <Input
                  className="mt-2 text-sm font-mono"
                  placeholder="HX… — ה-Content SID אחרי האישור"
                  value={sids[t.secret_key] ?? ''}
                  onChange={e => setSids(p => ({ ...p, [t.secret_key]: e.target.value }))}
                />
              </div>
            ))}

            <Button onClick={save} disabled={saving || Object.keys(sids).length === 0} className="w-full">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמירה'}
            </Button>
            {note && <p className="text-xs text-center text-slate-500">{note}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
