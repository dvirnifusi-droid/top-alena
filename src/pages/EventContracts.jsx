import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// EventBooking entity isn't exported from @/entities/all — use the proxy directly
const EventBooking = base44.entities.EventBooking;
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import TimePicker from '@/components/shared/TimePicker';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FileText, Plus, Send, Copy, Check, ExternalLink, Eye, Pencil, Calendar, Users, X, RotateCcw, Trash2, Files } from 'lucide-react';
import { renderEventTerms } from '@/data/eventContractTerms';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { isMainAlena } from '@/lib/tenant';
import PageHeader from '@/components/shared/PageHeader';

// Default catalogue mirrored from the owner's Word sign-off form.
// Editable manually in the dialog after pre-checking what's relevant.
const DEFAULT_MENU_CATEGORIES = [
  {
    key: 'openers', label: 'פתיחות 🥖',
    items: ['פרנה', 'טחינה', 'חומוס', 'משוויאה', 'סלט שוק'],
  },
  {
    key: 'sharing', label: 'חלוקה 🍢',
    items: ['בטטה בורלה', 'כרוב שרוף', 'תפוח אדמה קריספי', 'עראיס אסאדו', 'קרפצ׳יו בקר'],
  },
  {
    key: 'mains', label: 'עיקריות בשר מרכז שולחן 🥩',
    items: [
      'מועבט — פלטת בשרים (קבב, פרגית, מרגז)',
      'ירקות שרופים ופיתות זעתר על האש',
      'סלט עלים',
    ],
  },
  {
    key: 'closers', label: 'סיומות ☕',
    items: ['קנקן תה וקפה שחור', 'עוגיות מרוקאיות'],
  },
  {
    key: 'drinks', label: 'שתייה 🍺',
    items: ['בירה חבית / שתייה קלה — 1 לסועד'],
  },
];

const STATUS_BADGE = {
  draft: { label: 'טיוטה', cls: 'bg-gray-100 text-gray-700 border-gray-300' },
  sent: { label: 'נשלח ללקוח', cls: 'bg-[#F4ECD8] text-[#2E3819] border-[#D9BD83]' },
  signed: { label: 'חתום ✅', cls: 'bg-green-100 text-green-800 border-green-300' },
  cancelled: { label: 'בוטל', cls: 'bg-red-100 text-red-800 border-red-300' },
};

export default function EventContracts() {
  const brandName = useTenantBranding()?.name || 'המסעדה';
  const [contracts, setContracts] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [copiedToken, setCopiedToken] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [repSigning, setRepSigning] = useState(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [cRes, b] = await Promise.all([
        base44.functions.listEventContracts({ limit: 100 }),
        EventBooking.list('-created_date', 50).catch(() => []),
      ]);
      const cData = cRes?.data || cRes;
      setContracts(cData?.contracts || []);
      setBookings(b || []);
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  };

  const createFromBooking = async (booking_id) => {
    setCreating(true);
    try {
      const res = await base44.functions.createEventContract({ booking_id });
      const data = res?.data || res;
      if (!data?.ok) throw new Error(data?.message || 'שגיאה');
      await loadAll();
      setShowCreate(false);
      setEditing(data.contract);
    } catch (e) { alert('שגיאה ביצירה: ' + (e?.message || e)); }
    finally { setCreating(false); }
  };

  const createBlank = async () => {
    setCreating(true);
    try {
      const res = await base44.functions.createEventContract({});
      const data = res?.data || res;
      if (!data?.ok) throw new Error(data?.message || 'שגיאה');
      await loadAll();
      setShowCreate(false);
      setEditing(data.contract);
    } catch (e) { alert('שגיאה ביצירה: ' + (e?.message || e)); }
    finally { setCreating(false); }
  };

  const duplicateContract = async (c) => {
    setCreating(true);
    try {
      const res = await base44.functions.duplicateEventContract({ id: c.id });
      const data = res?.data || res;
      if (!data?.ok) throw new Error(data?.message || 'שגיאה');
      await loadAll();
      setEditing(data.contract); // open the fresh draft for tweaks
    } catch (e) { alert('שגיאה בשכפול: ' + (e?.message || e)); }
    finally { setCreating(false); }
  };

  const publicUrl = (token) => `${window.location.origin}/EventContractSign?token=${token}`;

  const copyLink = (token) => {
    navigator.clipboard.writeText(publicUrl(token));
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const sendWhatsApp = async (c) => {
    try {
      await base44.functions.sendEventContract({ id: c.id, via: 'whatsapp' });
      const phone = (c.customer_phone || '').replace(/[^\d]/g, '');
      const url = publicUrl(c.public_token);
      const msg = `שלום ${c.customer_name || ''} 👋\n\nמצורף החוזה הדיגיטלי לאירוע שלך ב${brandName}:\n${url}\n\nניתן לחתום ישירות מהטלפון. נא לחתום עד 48 שעות לפני האירוע.\n\nתודה,\n${brandName} אירועים 🔥`;
      const target = phone ? `https://wa.me/${phone.startsWith('0') ? '972' + phone.slice(1) : phone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
      window.open(target, '_blank');
      await loadAll();
    } catch (e) { alert('שגיאה: ' + (e?.message || e)); }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-amber-50 to-[#F4ECD8]" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">

        <PageHeader
          title="חוזי אירועים דיגיטליים"
          subtitle="חוזה דיגיטלי עם חתימה אונליין — לכל אירוע ננעל"
          icon={FileText}
          action={(
            <Button onClick={() => setShowCreate(true)} className="bg-amber-600 hover:bg-amber-700">
              <Plus className="w-4 h-4 ml-1" /> חוזה חדש
            </Button>
          )}
        />

        {/* Status counters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {['draft', 'sent', 'signed', 'cancelled'].map(s => {
            const n = contracts.filter(c => c.status === s).length;
            return (
              <Card key={s} className="border">
                <CardContent className="p-3 text-center">
                  <div className="text-2xl font-bold text-gray-800">{n}</div>
                  <div className="text-xs text-gray-500 mt-1">{STATUS_BADGE[s].label}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Contracts list */}
        <Card>
          <CardHeader><CardTitle>חוזים אחרונים</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">טוען...</div>
            ) : contracts.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                אין חוזים עדיין. לחץ "חוזה חדש" כדי ליצור את הראשון.
              </div>
            ) : (
              <div className="divide-y">
                {contracts.map(c => {
                  const st = STATUS_BADGE[c.status] || STATUS_BADGE.draft;
                  return (
                    <div key={c.id} className="py-3 flex flex-wrap gap-3 items-center">
                      <div className="flex-1 min-w-[200px]">
                        <div className="font-bold flex items-center gap-2">
                          {c.customer_name || 'ללא שם'}
                          <Badge className={`${st.cls} border text-[10px]`}>{st.label}</Badge>
                        </div>
                        <div className="text-xs text-gray-500 mt-1 flex gap-3 flex-wrap">
                          {c.contract_number && <span>#{c.contract_number}</span>}
                          {c.event_date && <span><Calendar className="w-3 h-3 inline ml-0.5" /> {c.event_date}</span>}
                          {c.guest_count && <span><Users className="w-3 h-3 inline ml-0.5" /> {c.guest_count} סועדים</span>}
                          {c.subtotal_ils && <span>💰 {c.subtotal_ils.toLocaleString()}₪</span>}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-wrap items-center">
                        <select
                          value={c.status || 'draft'}
                          onChange={async (e) => {
                            const next = e.target.value;
                            if (next === c.status) return;
                            if (!window.confirm(`לשנות סטטוס ל-"${STATUS_BADGE[next]?.label || next}"?`)) return;
                            try {
                              await base44.functions.updateEventContract({ id: c.id, status: next });
                              load();
                            } catch (err) {
                              alert('שגיאה: ' + (err?.message || ''));
                            }
                          }}
                          className="h-8 px-2 text-xs border rounded-md bg-white"
                          title="שנה סטטוס"
                        >
                          {Object.entries(STATUS_BADGE).map(([key, v]) => (
                            <option key={key} value={key}>{v.label}</option>
                          ))}
                        </select>
                        {c.status !== 'signed' && (
                          <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                            <Pencil className="w-3.5 h-3.5 ml-1" /> ערוך
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => window.open(publicUrl(c.public_token), '_blank')}>
                          <Eye className="w-3.5 h-3.5 ml-1" /> צפה
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => duplicateContract(c)} disabled={creating} title="צור חוזה חדש (טיוטה) מהחוזה הזה">
                          <Files className="w-3.5 h-3.5 ml-1" /> שכפל
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => copyLink(c.public_token)}>
                          {copiedToken === c.public_token
                            ? <Check className="w-3.5 h-3.5 ml-1 text-green-600" />
                            : <Copy className="w-3.5 h-3.5 ml-1" />}
                          העתק קישור
                        </Button>
                        {c.status !== 'signed' && (
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => sendWhatsApp(c)}>
                            <Send className="w-3.5 h-3.5 ml-1" /> שלח בוואטסאפ
                          </Button>
                        )}
                        {c.status === 'signed' && !c.rep_signed_at && (
                          <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => setRepSigning(c)}>
                            ✍️ חתום כנציג {brandName}
                          </Button>
                        )}
                        {c.status === 'signed' && c.rep_signed_at && (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">
                            ✅ חתום ע״י {c.rep_name || 'נציג'}
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={deletingId === c.id}
                          className="text-red-600 border-red-300 hover:bg-red-50 disabled:opacity-50"
                          onClick={async () => {
                            if (deletingId) return;
                            if (!window.confirm(`למחוק לצמיתות את החוזה של "${c.customer_name || 'ללא שם'}"?\nפעולה זו בלתי הפיכה.`)) return;
                            setDeletingId(c.id);
                            // Optimistic removal — user sees it gone immediately
                            // and can't double-click the same row.
                            setContracts(prev => prev.filter(x => x.id !== c.id));
                            try {
                              await base44.functions.deleteEventContract({ id: c.id });
                            } catch (err) {
                              const msg = err?.message || '';
                              // 'Not found' = already deleted (likely a double-fire); silent.
                              if (!/not found/i.test(msg)) {
                                alert('שגיאה: ' + msg);
                                load(); // restore on real failure
                              }
                            } finally {
                              setDeletingId(null);
                            }
                          }}
                          title="מחק חוזה"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* CREATE dialog: pick a booking or blank */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader><DialogTitle>חוזה חדש — מאיפה להתחיל?</DialogTitle></DialogHeader>
          <div className="space-y-3 py-3">
            <Button className="w-full justify-start" variant="outline" onClick={createBlank} disabled={creating}>
              📄 חוזה ריק (אמלא ידנית)
            </Button>
            <div className="text-xs text-gray-500 pt-2 border-t">או — בנה מאירוע קיים:</div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {bookings.length === 0 && (
                <div className="text-sm text-gray-400 text-center py-4">אין EventBookings במערכת</div>
              )}
              {bookings.map(b => (
                <button
                  key={b.id}
                  onClick={() => createFromBooking(b.id)}
                  disabled={creating}
                  className="w-full text-right border rounded-lg p-2 text-sm hover:bg-amber-50 transition-colors"
                >
                  <div className="font-bold">{b.customer_name || 'ללא שם'}</div>
                  <div className="text-xs text-gray-500">
                    {b.event_date || 'ללא תאריך'} · {b.guest_count || '?'} סועדים · {b.total_ils ? `${b.total_ils}₪` : ''}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* EDIT dialog */}
      {editing && <EditDialog contract={editing} onClose={() => { setEditing(null); loadAll(); }} />}

      {/* REP SIGN dialog */}
      {repSigning && <RepSignDialog contract={repSigning} onClose={() => { setRepSigning(null); loadAll(); }} />}
    </div>
  );
}

function RepSignDialog({ contract, onClose }) {
  const brandName = useTenantBranding()?.name || 'המסעדה';
  const canvasRef = React.useRef(null);
  // Prefill the rep name only on the flagship Alena app (the owner's name);
  // other tenants start blank so they type their own representative.
  const [repName, setRepName] = React.useState(isMainAlena() ? 'דביר ניפוסי' : '');
  const [submitting, setSubmitting] = React.useState(false);
  const drawing = React.useRef(false);
  const hasInk = React.useRef(false);
  // Bumped when 'clear' is pressed so the canvas re-initialises (resize + dpr).
  const [version, setVersion] = React.useState(0);

  // Wire pointer events once the canvas is mounted in the Radix portal.
  // useLayoutEffect runs after the canvas is in the DOM, so getBoundingClientRect
  // returns real numbers (the original useEffect could race with the dialog's
  // open animation and end up with rect.width === 0 → NaN coordinates).
  React.useLayoutEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    // Match backing-store resolution to the displayed CSS size × devicePixelRatio
    // so strokes are crisp and coordinates line up 1:1 with cursor position.
    const rect = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.round(rect.width * dpr));
    c.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';

    const pos = (e) => {
      const r = c.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const start = (e) => {
      // Only react to primary mouse / pen / touch — ignore right-click.
      if (e.button && e.button !== 0) return;
      drawing.current = true;
      try { c.setPointerCapture?.(e.pointerId); } catch {}
      const [x, y] = pos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
      // tiny dot so a single click still leaves a mark
      ctx.lineTo(x + 0.01, y + 0.01);
      ctx.stroke();
      hasInk.current = true;
      e.preventDefault();
    };
    const move = (e) => {
      if (!drawing.current) return;
      const [x, y] = pos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
      hasInk.current = true;
      e.preventDefault();
    };
    const end = (e) => {
      drawing.current = false;
      try { c.releasePointerCapture?.(e.pointerId); } catch {}
    };

    c.addEventListener('pointerdown', start);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', end);
    return () => {
      c.removeEventListener('pointerdown', start);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', end);
      c.removeEventListener('pointercancel', end);
      c.removeEventListener('pointerleave', end);
    };
  }, [version]);

  const clearSig = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    hasInk.current = false;
    setVersion(v => v + 1);
  };

  // Whether any pixels were drawn. Tracked via the hasInk ref so we don't need
  // to scan the bitmap — that path read the device-pixel buffer and returned
  // 'blank' when DPR != 1 because the alpha channel uses pre-multiplied math.
  const isCanvasBlank = () => !hasInk.current;

  const submit = async () => {
    if (!repName.trim()) { alert('יש להזין שם'); return; }
    if (isCanvasBlank()) { alert('יש לחתום'); return; }
    setSubmitting(true);
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const res = await base44.functions.signEventContractAsRep({
        id: contract.id,
        rep_name: repName.trim(),
        signature_data_url: dataUrl,
      });
      const r = res?.data ?? res;
      if (!r?.ok) throw new Error(r?.message || 'נכשל');
      onClose();
    } catch (e) {
      alert('שגיאה: ' + (e?.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>✍️ חתימת נציג {brandName} — {contract.contract_number || ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
            הלקוח חתם ב-{contract.signed_at ? new Date(contract.signed_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '—'}.
            חתום עכשיו כנציג {brandName} להשלמת התקשרות מחייבת.
          </div>
          <Field label="שם הנציג">
            <Input value={repName} onChange={e => setRepName(e.target.value)} placeholder="שם מלא" />
          </Field>
          <div>
            <Label className="block text-xs text-gray-600 mb-1">חתימה</Label>
            <canvas
              ref={canvasRef}
              className="w-full h-32 border-2 border-amber-300 rounded-lg bg-white touch-none cursor-crosshair block"
            />
            <button type="button" onClick={clearSig} className="mt-1 text-xs text-gray-500 underline">נקה</button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={submit} disabled={submitting} className="bg-amber-600 hover:bg-amber-700">
            {submitting ? 'חותם...' : '✅ חתום ושמור'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ contract, onClose }) {
  const brandName = useTenantBranding()?.name || 'המסעדה';
  const [c, setC] = useState(contract);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setC(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      // Coerce numeric fields: empty/null → null (so Prisma doesn't reject ''
      // for an INT column with the cryptic 'Argument is invalid' that the user
      // sees as 'function_error').
      const payload = { ...c };
      ['guest_count', 'kids_count', 'price_per_guest_ils', 'upsells_total_ils', 'subtotal_ils', 'deposit_ils', 'balance_ils', 'tip_ils']
        .forEach(k => {
          const v = payload[k];
          if (v === '' || v === null || v === undefined) { payload[k] = null; return; }
          const n = Number(v);
          payload[k] = Number.isFinite(n) ? Math.round(n) : null;
        });
      const res = await base44.functions.updateEventContract(payload);
      const data = res?.data || res;
      if (!data?.ok) throw new Error(data?.message || 'שגיאה');
      onClose();
    } catch (e) { alert('שגיאה בשמירה: ' + (e?.message || e)); }
    finally { setSaving(false); }
  };

  // Compute balance live (subtotal already includes tip; we just subtract the deposit)
  const subtotal = Number(c.subtotal_ils || 0);
  const deposit = Number(c.deposit_ils || 0);
  const autoBalance = Math.max(0, subtotal - deposit);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent dir="rtl" className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>עריכת חוזה {c.contract_number || ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="bg-[#F4ECD8] border border-[#E8D9B5] rounded-lg p-3">
            <div className="text-xs font-bold text-blue-900 mb-2">פרטי המזמין</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="שם מלא"><Input value={c.customer_name || ''} onChange={e => set('customer_name', e.target.value)} /></Field>
              <Field label="טלפון"><Input value={c.customer_phone || ''} onChange={e => set('customer_phone', e.target.value)} placeholder="050-1234567" /></Field>
              <Field label="אימייל"><Input type="email" value={c.customer_email || ''} onChange={e => set('customer_email', e.target.value)} placeholder="name@example.com" /></Field>
              <Field label="ת.ז. / ח.פ."><Input value={c.customer_id_or_taxno || ''} onChange={e => set('customer_id_or_taxno', e.target.value)} placeholder="9 ספרות" /></Field>
              <div className="md:col-span-2">
                <Field label="כתובת מלאה"><Input value={c.customer_address || ''} onChange={e => set('customer_address', e.target.value)} placeholder="רחוב, מספר, עיר, מיקוד" /></Field>
              </div>
              <Field label="שם חברה (אם רלוונטי)"><Input value={c.company_or_event_label || ''} onChange={e => set('company_or_event_label', e.target.value)} /></Field>
              <Field label="סוג האירוע"><Input value={c.event_type || ''} onChange={e => set('event_type', e.target.value)} placeholder="יום הולדת, בר מצווה, אירוע עסקי..." /></Field>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="מיקום"><Input value={c.event_location || ''} onChange={e => set('event_location', e.target.value)} /></Field>
            <Field label="תאריך"><Input type="date" value={c.event_date || ''} onChange={e => set('event_date', e.target.value)} /></Field>
            <Field label="שעת הגעה"><TimePicker value={c.event_start_time || ''} onChange={v => set('event_start_time', v)} /></Field>
            <Field label="שעת סיום"><TimePicker value={c.event_end_time || ''} onChange={v => set('event_end_time', v)} /></Field>
            <Field label="כמות סועדים מחויב"><Input type="number" value={c.guest_count || ''} onChange={e => set('guest_count', e.target.value)} /></Field>
            <Field label="ילדים (עד גיל 12)"><Input type="number" value={c.kids_count || ''} onChange={e => set('kids_count', e.target.value)} placeholder="0" /></Field>
            <Field label="חבילה (טקסט חופשי)"><Input value={c.package_label || ''} onChange={e => set('package_label', e.target.value)} placeholder="150 ₪ לסועד / שולחן שוק / תפריט מותאם" /></Field>
            <Field label="מחיר לסועד (₪)"><Input type="number" value={c.price_per_guest_ils || ''} onChange={e => set('price_per_guest_ils', e.target.value)} /></Field>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 grid grid-cols-2 gap-3">
            <Field label="תוספות (₪)"><Input type="number" value={c.upsells_total_ils || ''} onChange={e => set('upsells_total_ils', e.target.value)} /></Field>
            <Field label="טיפ למלצרים (₪)"><Input type="number" value={c.tip_ils || ''} onChange={e => set('tip_ils', e.target.value)} placeholder="0" /></Field>
            <Field label="סה״כ אירוע כולל טיפ (₪)"><Input type="number" value={c.subtotal_ils || ''} onChange={e => set('subtotal_ils', e.target.value)} /></Field>
            <Field label="מקדמה (₪)"><Input type="number" value={c.deposit_ils || ''} onChange={e => set('deposit_ils', e.target.value)} /></Field>
            <Field label={`יתרה (אוטומטי: ${autoBalance}₪)`}>
              <Input type="number" value={c.balance_ils ?? autoBalance} onChange={e => set('balance_ils', e.target.value)} />
            </Field>
          </div>

          <MenuPicker
            value={c.menu_snapshot}
            onChange={(arr) => set('menu_snapshot', arr)}
          />

          <TermsEditor
            value={c.terms_snapshot}
            onChange={(arr) => set('terms_snapshot', arr)}
            brandName={brandName}
          />

          <Field label="הערות"><Textarea rows={2} value={c.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>

          <div className="bg-[#F4ECD8] border border-[#E8D9B5] rounded p-3 text-xs text-[#44512C]">
            🔗 קישור לחתימה: <code className="bg-white px-1 rounded text-[10px]">{window.location.origin}/EventContractSign?token={c.public_token}</code>
            <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/EventContractSign?token=${c.public_token}`); alert('הועתק'); }} className="ml-2 underline">העתק</button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>סגור</Button>
          <Button onClick={save} disabled={saving} className="bg-amber-600 hover:bg-amber-700">
            {saving ? 'שומר...' : '💾 שמור שינויים'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="mb-1 block text-xs text-gray-600">{label}</Label>
      {children}
    </div>
  );
}

// Categorized menu picker with checkboxes for the default catalogue + an
// "add custom item" button per category. value/onChange use a flat array of
// {category, name} so the public sign view renders cleanly.
function MenuPicker({ value, onChange }) {
  // Normalize incoming value (string|object|legacy) into [{category, name}]
  // Filter out the special __meta entry — it carries per-category overrides
  // (label, min_select, max_select) but isn't a dish.
  const rawArr = Array.isArray(value) ? value : [];
  const metaEntry = rawArr.find((v) => v && typeof v === 'object' && v.category === '__meta');
  const items = rawArr
    .filter((v) => !(v && typeof v === 'object' && v.category === '__meta'))
    .map((v) => {
      if (typeof v === 'string') return { category: 'custom', name: v };
      return { category: v.category || 'custom', name: v.name || v.label || String(v) };
    });
  // Per-category overrides keyed by cat.key
  const overrides = (metaEntry?.meta?.categories || []).reduce((acc, c) => { acc[c.key] = c; return acc; }, {});
  const getLabel = (cat) => overrides[cat.key]?.label || cat.label;
  const getMin = (cat) => overrides[cat.key]?.min_select ?? null;
  const getMax = (cat) => overrides[cat.key]?.max_select ?? null;

  const writeBack = (newItems, newOverrides) => {
    const overrideList = Object.values(newOverrides).filter((o) => o.label || o.min_select != null || o.max_select != null);
    const meta = overrideList.length ? [{ category: '__meta', meta: { categories: overrideList } }] : [];
    onChange([...meta, ...newItems]);
  };
  const updateOverride = (catKey, patch) => {
    const next = { ...overrides, [catKey]: { key: catKey, ...overrides[catKey], ...patch } };
    // Strip empty
    if (!next[catKey].label && next[catKey].min_select == null && next[catKey].max_select == null) {
      delete next[catKey];
    }
    writeBack(items, next);
  };

  const isChecked = (cat, name) => items.some(it => it.category === cat && it.name === name);
  const toggle = (cat, name) => {
    const next = isChecked(cat, name)
      ? items.filter(it => !(it.category === cat && it.name === name))
      : [...items, { category: cat, name }];
    writeBack(next, overrides);
  };
  const [customInput, setCustomInput] = useState({}); // {category: text}
  const addCustom = (cat) => {
    const txt = (customInput[cat] || '').trim();
    if (!txt) return;
    writeBack([...items, { category: cat, name: txt }], overrides);
    setCustomInput(prev => ({ ...prev, [cat]: '' }));
  };
  const removeCustom = (cat, name) => {
    writeBack(items.filter(it => !(it.category === cat && it.name === name)), overrides);
  };

  return (
    <div className="space-y-3">
      <Label className="text-base font-bold flex items-center gap-2">🍴 תפריט האירוע</Label>
      <p className="text-xs text-gray-500">סמן/י מה ייכלל בחבילה. ניתן לערוך את שם הקטגוריה ולקבוע "בחר X מתוך הקטגוריה".</p>

      {DEFAULT_MENU_CATEGORIES.map(cat => {
        const catalogue = cat.items;
        const customs = items.filter(it => it.category === cat.key && !catalogue.includes(it.name));
        const minSel = getMin(cat);
        const maxSel = getMax(cat);
        return (
          <div key={cat.key} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Input
                value={getLabel(cat)}
                onChange={(e) => updateOverride(cat.key, { label: e.target.value === cat.label ? '' : e.target.value })}
                className="font-bold text-amber-900 bg-transparent border-amber-200 h-8 text-sm flex-1 min-w-[160px]"
                title="ערוך את שם הקטגוריה"
              />
              <span className="text-xs text-gray-500 whitespace-nowrap">בחר</span>
              <Input
                type="number"
                min="0"
                value={minSel ?? ''}
                onChange={(e) => updateOverride(cat.key, { min_select: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value) || 0) })}
                className="h-8 w-14 text-xs"
                placeholder="—"
                title="מינימום מנות לבחירה"
              />
              <span className="text-xs text-gray-500">עד</span>
              <Input
                type="number"
                min="0"
                value={maxSel ?? ''}
                onChange={(e) => updateOverride(cat.key, { max_select: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value) || 0) })}
                className="h-8 w-14 text-xs"
                placeholder="—"
                title="מקסימום מנות לבחירה"
              />
              <span className="text-xs text-gray-500">מנות</span>
            </div>
            {(minSel != null || maxSel != null) && (
              <p className="text-[11px] text-amber-700 mb-1">
                ⚠️ הלקוח יראה: {minSel != null && maxSel != null ? `יש לבחור ${minSel === maxSel ? minSel : `${minSel}–${maxSel}`}` : minSel != null ? `יש לבחור לפחות ${minSel}` : `אפשר עד ${maxSel}`} מנות מהקטגוריה.
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
              {catalogue.map(name => (
                <label key={name} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white/60 rounded px-2 py-1">
                  <input
                    type="checkbox"
                    checked={isChecked(cat.key, name)}
                    onChange={() => toggle(cat.key, name)}
                    className="w-4 h-4"
                  />
                  <span>{name}</span>
                </label>
              ))}
            </div>
            {customs.length > 0 && (
              <div className="mt-2 pt-2 border-t border-amber-200 space-y-1">
                {customs.map(c => (
                  <div key={c.name} className="flex items-center justify-between gap-2 text-sm bg-white/60 rounded px-2 py-1">
                    <span>✨ {c.name}</span>
                    <button onClick={() => removeCustom(cat.key, c.name)} className="text-red-500 hover:text-red-700">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 mt-2">
              <Input
                value={customInput[cat.key] || ''}
                onChange={(e) => setCustomInput(prev => ({ ...prev, [cat.key]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(cat.key); } }}
                placeholder="הוסף/י מנה לקטגוריה זו..."
                className="text-sm h-8"
              />
              <Button type="button" size="sm" onClick={() => addCustom(cat.key)} className="h-8 bg-amber-600 hover:bg-amber-700">
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Terms editor — handles strings, arrays of strings, arrays of {text}, and the
// legacy {cancellation_days, headcount_deadline_days} JSON object from the kit.
function TermsEditor({ value, onChange, brandName = 'המסעדה' }) {
  // Normalize to array of strings
  const lines = (() => {
    if (Array.isArray(value)) return value.map(t => typeof t === 'string' ? t : (t.text || t.label || ''));
    if (typeof value === 'string') return value.split('\n');
    if (value && typeof value === 'object') {
      // Legacy kit shape — render readable defaults
      const out = [];
      if (value.cancellation_days) out.push(`ביטול אירוע חייב להתבצע עד ${value.cancellation_days} ימים לפני המועד; אחרת המקדמה לא חוזרת.`);
      if (value.headcount_deadline_days) out.push(`עדכון כמות סופית של סועדים עד ${value.headcount_deadline_days} ימים לפני האירוע.`);
      return out;
    }
    return [];
  })();
  const text = lines.join('\n');

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Label className="text-xs text-gray-600">תנאים (שורה לכל סעיף · שורה שמתחילה ב-<code className="bg-gray-100 px-1 rounded">## </code> תוצג ככותרת ראשית)</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            if (text.trim() && !confirm(`זה ידרוס את כל התנאים הנוכחיים בתבנית הרשמית של ${brandName}. להמשיך?`)) return;
            onChange(renderEventTerms(brandName));
          }}
          className="h-7 text-xs text-amber-700 hover:text-amber-900"
        >
          <RotateCcw className="w-3 h-3 ml-1" />
          טען תבנית רשמית
        </Button>
      </div>
      <Textarea
        rows={12}
        value={text}
        // Don't filter blanks — that's what blocked typing previously
        onChange={(e) => onChange(e.target.value.split('\n'))}
        placeholder="## כותרת סעיף&#10;הסעיף הראשון&#10;הסעיף השני&#10;## כותרת סעיף נוסף..."
        className="font-mono text-xs"
      />
    </div>
  );
}
