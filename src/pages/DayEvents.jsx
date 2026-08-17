import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { UploadFile } from '@/integrations/Core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, Copy, Image as ImageIcon, Check } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

// "ערב מיוחד" — everything the guest sees for one specific date, and a cap for
// that evening. Until now the booking page only knew recurring weeknights, and
// those were hardcoded, so selling a single night wasn't possible at all.
const EMPTY = { event_date: '', title: '', description: '', image_url: '', capacity: '',
  payment_mode: 'none', price: '', charge_per: 'person', active: true };

export default function DayEvents() {
  const { toast } = useToast();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState('');

  const load = async () => {
    try {
      const r = await base44.functions.listDayEvents();
      const d = r?.data || r;
      setEvents(d?.events || []);
    } catch (e) {
      toast({ title: 'שגיאה בטעינה', description: e?.message || String(e), variant: 'destructive' });
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.event_date) { toast({ title: 'בחר/י תאריך', variant: 'destructive' }); return; }
    if (!form.title.trim()) { toast({ title: 'חסרה כותרת', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await base44.functions.saveDayEvent(form);
      toast({ title: 'נשמר' });
      setForm(EMPTY);
      await load();
    } catch (e) {
      toast({ title: 'שגיאה בשמירה', description: e?.message || String(e), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const remove = async (event_date) => {
    try {
      await base44.functions.deleteDayEvent({ event_date });
      await load();
    } catch (e) {
      toast({ title: 'שגיאה במחיקה', description: e?.message || String(e), variant: 'destructive' });
    }
  };

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await UploadFile({ file });
      setForm((f) => ({ ...f, image_url: file_url }));
    } catch (e) {
      toast({ title: 'שגיאה בהעלאה', description: e?.message || String(e), variant: 'destructive' });
    } finally { setUploading(false); }
  };

  const linkFor = (d) => `${window.location.origin}/PublicReservation?date=${d}&only=1`;
  const copy = async (d) => {
    try {
      await navigator.clipboard.writeText(linkFor(d));
      setCopied(d);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      // Clipboard is blocked outside a secure context or without permission —
      // show the link so it can still be copied by hand.
      toast({ title: 'העתק ידנית', description: linkFor(d) });
    }
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4" dir="rtl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">ערבים מיוחדים</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          מסיבה, ערב שף, ראש השנה — מה שהאורח רואה כשהוא נכנס לתאריך הזה, וכמה מקומות יש.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">ערב חדש</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>תאריך *</Label>
              <Input type="date" value={form.event_date}
                onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))} />
            </div>
            <div>
              <Label>תקרת מקומות</Label>
              <Input type="number" min="1" placeholder="ריק = ללא הגבלה" value={form.capacity}
                onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>כותרת *</Label>
            <Input placeholder="מסיבת סוף קיץ" value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <Label>תיאור</Label>
            <Textarea rows={4} placeholder="מה קורה באותו ערב — שעות, מה כלול, מחיר, דרס-קוד…"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="rounded-lg p-3" style={{ background: '#FAF6EC', border: '1px solid #E3D3AC' }}>
            <Label>תשלום</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {[
                { id: 'none', t: 'ללא תשלום', d: 'שמירת מקום בלבד' },
                { id: 'deposit', t: 'פיקדון', d: 'תפיסת אשראי — נגבה רק אם לא הגיעו' },
                { id: 'ticket', t: 'מכירת כרטיס', d: 'חיוב מיידי' },
              ].map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, payment_mode: o.id }))}
                  className="rounded-lg px-3 min-h-[40px] text-sm border"
                  style={form.payment_mode === o.id
                    ? { background: '#C9A15A', color: '#241811', borderColor: '#C9A15A', fontWeight: 700 }
                    : { background: '#fff', color: '#5C4B3A', borderColor: '#E3D3AC' }}
                >
                  {o.t}
                </button>
              ))}
            </div>
            <p className="text-[11.5px] text-slate-500 mt-1.5">
              {form.payment_mode === 'ticket'
                ? 'הכסף נגבה מיד. זהו אירוע מס — צריך מדיניות ביטול והחזר ברורה.'
                : form.payment_mode === 'deposit'
                  ? 'הכרטיס נתפס ולא מחויב. חיוב רק אם לא הגיעו, וידנית.'
                  : 'האורח מזמין בלי לשלם.'}
            </p>
            {form.payment_mode !== 'none' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <Label>סכום (₪)</Label>
                  <Input type="number" min="1" value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
                </div>
                <div>
                  <Label>לחשב לפי</Label>
                  <div className="flex gap-1.5 mt-1">
                    {[{ id: 'person', t: 'לכל סועד' }, { id: 'booking', t: 'להזמנה' }].map((o) => (
                      <button key={o.id} type="button"
                        onClick={() => setForm((f) => ({ ...f, charge_per: o.id }))}
                        className="rounded-lg px-3 min-h-[40px] text-sm border flex-1"
                        style={form.charge_per === o.id
                          ? { background: '#F4ECD8', color: '#241811', borderColor: '#C9A15A', fontWeight: 700 }
                          : { background: '#fff', color: '#5C4B3A', borderColor: '#E3D3AC' }}>
                        {o.t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <Label>תמונה</Label>
            <div className="flex items-center gap-2 mt-1">
              <label className="cursor-pointer">
                <span className="inline-flex items-center gap-2 rounded-lg border px-3 min-h-[40px] text-sm">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                  העלה תמונה
                </span>
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => upload(e.target.files?.[0])} />
              </label>
              {form.image_url && <img src={form.image_url} alt="" className="h-10 rounded" />}
            </div>
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Plus className="w-4 h-4 ml-2" />}
            שמור ערב
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">ערבים מוגדרים ({events.length})</CardTitle></CardHeader>
        <CardContent>
          {!events.length && <p className="text-sm text-slate-400 py-4 text-center">עוד לא הגדרת ערב מיוחד</p>}
          {events.map((e) => {
            const full = e.capacity && e.seats_booked >= e.capacity;
            return (
              <div key={e.event_date} className="flex items-start gap-3 py-3 border-b last:border-0">
                {e.image_url && <img src={e.image_url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm">{e.title}</span>
                    <Badge variant="outline" className="text-xs tabular-nums">
                      {new Date(e.event_date).toLocaleDateString('he-IL')}
                    </Badge>
                    {e.capacity != null && (
                      <Badge className={full ? 'bg-red-100 text-red-800 text-xs' : 'bg-emerald-100 text-emerald-800 text-xs'}>
                        {e.seats_booked ?? 0}/{e.capacity} מקומות
                      </Badge>
                    )}
                  </div>
                  {e.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{e.description}</p>}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => copy(e.event_date)}>
                      {copied === e.event_date ? <Check className="w-3.5 h-3.5 ml-1" /> : <Copy className="w-3.5 h-3.5 ml-1" />}
                      {copied === e.event_date ? 'הועתק' : 'העתק קישור'}
                    </Button>
                    <Button size="sm" variant="ghost"
                      onClick={() => setForm({ ...EMPTY, ...e, capacity: e.capacity ?? '' })}>
                      ערוך
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(e.event_date)}>
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
