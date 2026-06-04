import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { EventBooking } from '@/entities/all';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FileText, Plus, Send, Copy, Check, ExternalLink, Eye, Pencil, Calendar, Users } from 'lucide-react';

const STATUS_BADGE = {
  draft: { label: 'טיוטה', cls: 'bg-gray-100 text-gray-700 border-gray-300' },
  sent: { label: 'נשלח ללקוח', cls: 'bg-blue-100 text-blue-800 border-blue-300' },
  signed: { label: 'חתום ✅', cls: 'bg-green-100 text-green-800 border-green-300' },
  cancelled: { label: 'בוטל', cls: 'bg-red-100 text-red-800 border-red-300' },
};

export default function EventContracts() {
  const [contracts, setContracts] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [copiedToken, setCopiedToken] = useState(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [cRes, b] = await Promise.all([
        base44.functions.listEventContracts({ limit: 100 }),
        EventBooking.list('-created_date', 50).catch(() => []),
      ]);
      setContracts(cRes?.contracts || []);
      setBookings(b || []);
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  };

  const createFromBooking = async (booking_id) => {
    setCreating(true);
    try {
      const res = await base44.functions.createEventContract({ booking_id });
      if (!res?.ok) throw new Error(res?.message || 'שגיאה');
      await loadAll();
      setShowCreate(false);
      setEditing(res.contract);
    } catch (e) { alert('שגיאה ביצירה: ' + (e?.message || e)); }
    finally { setCreating(false); }
  };

  const createBlank = async () => {
    setCreating(true);
    try {
      const res = await base44.functions.createEventContract({});
      if (!res?.ok) throw new Error(res?.message || 'שגיאה');
      await loadAll();
      setShowCreate(false);
      setEditing(res.contract);
    } catch (e) { alert('שגיאה ביצירה: ' + (e?.message || e)); }
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
      const msg = `שלום ${c.customer_name || ''} 👋\n\nמצורף החוזה הדיגיטלי לאירוע שלך בעלינא:\n${url}\n\nניתן לחתום ישירות מהטלפון. נא לחתום עד 48 שעות לפני האירוע.\n\nתודה,\nעלינא אירועים 🔥`;
      const target = phone ? `https://wa.me/${phone.startsWith('0') ? '972' + phone.slice(1) : phone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
      window.open(target, '_blank');
      await loadAll();
    } catch (e) { alert('שגיאה: ' + (e?.message || e)); }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-amber-50 to-rose-50" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <FileText className="w-8 h-8 text-amber-600" />
              חוזי אירועים דיגיטליים
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              חוזה דיגיטלי עם חתימה אונליין — לכל אירוע ננעל
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="bg-amber-600 hover:bg-amber-700">
            <Plus className="w-4 h-4 ml-1" /> חוזה חדש
          </Button>
        </div>

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
                      <div className="flex gap-1 flex-wrap">
                        {c.status !== 'signed' && (
                          <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                            <Pencil className="w-3.5 h-3.5 ml-1" /> ערוך
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => window.open(publicUrl(c.public_token), '_blank')}>
                          <Eye className="w-3.5 h-3.5 ml-1" /> צפה
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
    </div>
  );
}

function EditDialog({ contract, onClose }) {
  const [c, setC] = useState(contract);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setC(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      // Numeric coercion
      const payload = { ...c };
      ['guest_count', 'price_per_guest_ils', 'upsells_total_ils', 'subtotal_ils', 'deposit_ils', 'balance_ils']
        .forEach(k => { if (payload[k] !== '' && payload[k] !== null && payload[k] !== undefined) payload[k] = Number(payload[k]) || 0; });
      const res = await base44.functions.updateEventContract(payload);
      if (!res?.ok) throw new Error(res?.message || 'שגיאה');
      onClose();
    } catch (e) { alert('שגיאה בשמירה: ' + (e?.message || e)); }
    finally { setSaving(false); }
  };

  // Compute balance live
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="שם הלקוח"><Input value={c.customer_name || ''} onChange={e => set('customer_name', e.target.value)} /></Field>
            <Field label="טלפון"><Input value={c.customer_phone || ''} onChange={e => set('customer_phone', e.target.value)} placeholder="050-1234567" /></Field>
            <Field label="חברה / שם האירוע"><Input value={c.company_or_event_label || ''} onChange={e => set('company_or_event_label', e.target.value)} /></Field>
            <Field label="מיקום"><Input value={c.event_location || ''} onChange={e => set('event_location', e.target.value)} /></Field>
            <Field label="תאריך"><Input type="date" value={c.event_date || ''} onChange={e => set('event_date', e.target.value)} /></Field>
            <Field label="שעת התחלה"><Input type="time" value={c.event_start_time || ''} onChange={e => set('event_start_time', e.target.value)} /></Field>
            <Field label="שעת סיום"><Input type="time" value={c.event_end_time || ''} onChange={e => set('event_end_time', e.target.value)} /></Field>
            <Field label="כמות סועדים"><Input type="number" value={c.guest_count || ''} onChange={e => set('guest_count', e.target.value)} /></Field>
            <Field label="חבילה (טקסט חופשי)"><Input value={c.package_label || ''} onChange={e => set('package_label', e.target.value)} placeholder="150 ₪ לסועד / שולחן שוק / תפריט מותאם" /></Field>
            <Field label="מחיר לסועד (₪)"><Input type="number" value={c.price_per_guest_ils || ''} onChange={e => set('price_per_guest_ils', e.target.value)} /></Field>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 grid grid-cols-2 gap-3">
            <Field label="תוספות (₪)"><Input type="number" value={c.upsells_total_ils || ''} onChange={e => set('upsells_total_ils', e.target.value)} /></Field>
            <Field label="סה״כ אירוע (₪)"><Input type="number" value={c.subtotal_ils || ''} onChange={e => set('subtotal_ils', e.target.value)} /></Field>
            <Field label="מקדמה (₪)"><Input type="number" value={c.deposit_ils || ''} onChange={e => set('deposit_ils', e.target.value)} /></Field>
            <Field label={`יתרה (אוטומטי: ${autoBalance}₪)`}>
              <Input type="number" value={c.balance_ils ?? autoBalance} onChange={e => set('balance_ils', e.target.value)} />
            </Field>
          </div>

          <Field label="תפריט (פריט בכל שורה — יוצג בחוזה ללקוח)">
            <Textarea
              rows={6}
              value={Array.isArray(c.menu_snapshot) ? c.menu_snapshot.map(d => typeof d === 'string' ? d : (d.name || d.label)).join('\n') : ''}
              onChange={e => set('menu_snapshot', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
              placeholder="פרנה&#10;טחינה&#10;חומוס&#10;מועבט — פלטת בשרים..."
            />
          </Field>

          <Field label="תנאים (שורה לכל סעיף)">
            <Textarea
              rows={4}
              value={Array.isArray(c.terms_snapshot) ? c.terms_snapshot.map(t => typeof t === 'string' ? t : (t.text || '')).join('\n') : (c.terms_snapshot || '')}
              onChange={e => set('terms_snapshot', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
              placeholder="מקדמה לא חוזרת במקרה ביטול בתוך 7 ימים&#10;שעות נוספות יחויבו ב-X₪ לשעה&#10;..."
            />
          </Field>

          <Field label="הערות"><Textarea rows={2} value={c.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>

          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-700">
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
