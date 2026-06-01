import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, RefreshCw, Sparkles, CalendarHeart, Copy, Check, ExternalLink, QrCode, Flame, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const UTM_SOURCES = [
  { key: 'general',   label: 'כללי (בלי תיוג)', utm: '' },
  { key: 'facebook',  label: 'פייסבוק',          utm: 'facebook' },
  { key: 'instagram', label: 'אינסטגרם',         utm: 'instagram' },
  { key: 'google',    label: 'גוגל',             utm: 'google' },
  { key: 'tiktok',    label: 'טיקטוק',           utm: 'tiktok' },
  { key: 'whatsapp',  label: 'וואטסאפ אישי',     utm: 'whatsapp' },
  { key: 'qr',        label: 'QR במסעדה',         utm: 'qr_print' },
];
const PUBLIC_BASE_URL = 'https://topalena.com/EventsInquiry';
const withUtm = (utm) => utm ? `${PUBLIC_BASE_URL}?utm_source=${encodeURIComponent(utm)}` : PUBLIC_BASE_URL;

function EventsLinkCard() {
  const [sourceKey, setSourceKey] = useState('general');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const src = UTM_SOURCES.find((s) => s.key === sourceKey) || UTM_SOURCES[0];
  const link = withUtm(src.utm);
  const message =
    `היי 🌿 מסעדת עלינא — אירועים פרטיים\n` +
    `שמחים לארח אצלנו את האירוע שלכם. דברו עם העוזרת הדיגיטלית (5 שאלות קצרות) ונחזור אליכם עם הצעה מותאמת:\n\n${link}`;
  const copy = (text, setter) => {
    try { navigator.clipboard.writeText(text); } catch {}
    setter(true); setTimeout(() => setter(false), 2200);
  };
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(link)}`;

  return (
    <Card className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white" dir="rtl">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold mb-1">🌿 סוכן אירועים של עלינא</h3>
            <p className="text-emerald-100 text-sm">שתפו את הקישור — הסוכן בדפדפן מנהל את שיחת הסיווג ושומר את הפרטים.</p>
          </div>
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0"><Sparkles className="w-6 h-6" /></div>
        </div>
        <label className="block text-xs text-emerald-100 mb-1">מקור הפנייה (לתיוג קמפיין):</label>
        <select value={sourceKey} onChange={(e) => setSourceKey(e.target.value)}
          className="w-full bg-white/15 border border-white/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/50 mb-3">
          {UTM_SOURCES.map((s) => <option key={s.key} value={s.key} className="text-slate-800">{s.label}</option>)}
        </select>
        <div className="bg-white/10 rounded-lg p-3 mb-3 flex items-center gap-2">
          <a href={link} target="_blank" rel="noopener noreferrer" className="text-white underline text-sm truncate flex-1 text-left" dir="ltr">{link}</a>
          <button onClick={() => copy(link, setCopiedLink)} className="flex-shrink-0 bg-white/20 hover:bg-white/30 text-white text-xs font-bold py-1.5 px-2 rounded">
            {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
        <div className="flex gap-2 mb-3 flex-wrap">
          <button onClick={() => copy(message, setCopiedMsg)} className="flex-1 min-w-[140px] flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 text-white font-bold py-2 px-3 rounded-lg text-sm">
            {copiedMsg ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copiedMsg ? 'הועתק!' : 'העתק הודעה מוכנה'}
          </button>
          <button onClick={() => window.open(link, '_blank')} className="flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 text-white font-bold py-2 px-3 rounded-lg text-sm"><ExternalLink className="w-4 h-4" /> פתח</button>
          <button onClick={() => setShowQr((v) => !v)} className="flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 text-white font-bold py-2 px-3 rounded-lg text-sm"><QrCode className="w-4 h-4" /> QR</button>
        </div>
        {showQr && (
          <div className="bg-white rounded-xl p-4 flex flex-col items-center mb-2">
            <img src={qrSrc} alt="QR" className="w-48 h-48" />
            <div className="text-xs text-slate-600 mt-2 text-center">סרקו להגיע ישירות לסוכן</div>
          </div>
        )}
        <p className="text-emerald-200 text-xs mt-2 text-center">💡 כל מקור — לינק נפרד עם <code className="bg-white/10 px-1 rounded">utm_source</code>. נשמר אוטומטית על כל ליד.</p>
      </CardContent>
    </Card>
  );
}

function fmt(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}
function scoreBadge(score) {
  if (score == null) return <Badge variant="outline">—</Badge>;
  if (score >= 60) return <Badge className="bg-red-100 text-red-700"><Flame className="w-3 h-3 ml-1 inline" />חם {score}</Badge>;
  if (score >= 30) return <Badge className="bg-amber-100 text-amber-800">חמים {score}</Badge>;
  return <Badge className="bg-slate-100 text-slate-600">קר {score}</Badge>;
}
const STATUS = {
  new: { label: 'חדש', cls: 'bg-slate-100 text-slate-700' },
  qualified: { label: 'מסווג', cls: 'bg-orange-100 text-orange-800' },
  warm: { label: 'חמים', cls: 'bg-amber-100 text-amber-800' },
  cold: { label: 'קר', cls: 'bg-slate-100 text-slate-500' },
  booked: { label: 'נסגר ✓', cls: 'bg-green-100 text-green-800' },
};

function BookingsCard() {
  const [bookings, setBookings] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await base44.functions.listEventBookings({});
      setBookings(r?.bookings || []);
    } catch { setBookings([]); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => {
    const id = setInterval(() => { load(); }, 20000);
    return () => clearInterval(id);
  }, [load]);

  const act = async (booking, action) => {
    const notes = action === 'reject' ? (window.prompt('סיבת דחייה (אופציונלי):') || '') : '';
    setBusy(booking.id);
    try {
      const fn = action === 'approve' ? 'approveEventBooking' : 'rejectEventBooking';
      await base44.functions[fn]({ booking_id: booking.id, notes });
      await load();
    } catch (e) { alert('פעולה נכשלה: ' + (e?.message || '')); }
    finally { setBusy(null); }
  };

  // Manual-callback flow: any booking that hasn't been approved or rejected yet needs the manager's attention.
  const pending = bookings.filter((b) => b.approval_status !== 'approved' && b.approval_status !== 'rejected');
  const decided = bookings.filter((b) => b.approval_status === 'approved' || b.approval_status === 'rejected');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> אירועים שנסגרו — דרוש מנהל</CardTitle>
        <CardDescription>הלקוח הסכים על מחיר וסיים שיחה בצ׳אט. התקשר, גבה ידנית, ואז סמן <strong>"אשר"</strong> — זה יחסום את השולחן ב-SeatingSetup. <strong>"דחה"</strong> = לבטל את ההזמנה.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
        ) : pending.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">אין אירועים ממתינים.</p>
        ) : (
          <div className="space-y-2">
            {pending.map((b) => (
              <div key={b.id} className="border rounded-lg p-3 bg-emerald-50/40">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong>{b.customer_name || '-'}</strong>
                      {b.customer_phone && (
                        <a href={`tel:${b.customer_phone}`} className="text-blue-600 hover:underline">📞 {b.customer_phone}</a>
                      )}
                    </div>
                    <div className="text-xs text-slate-600 mt-1">📅 {b.event_date} {b.event_time || ''} · 👥 {b.guest_count} · 🍽 {b.selected_menu?.name || '-'} · 💰 ₪{b.total_ils || 0}</div>
                    {Array.isArray(b.selected_upsells) && b.selected_upsells.length > 0 && (
                      <div className="text-xs text-slate-500 mt-0.5">✨ {b.selected_upsells.map((u) => u.name).join(', ')}</div>
                    )}
                    {b.short_notice && <Badge className="bg-amber-100 text-amber-800 mt-1">Short-notice</Badge>}
                    {b.notes && (
                      <div className="mt-2 p-2 bg-emerald-50 border border-emerald-100 rounded text-xs text-emerald-900">
                        <span className="font-bold">🧠 סיכום שיחה: </span>{b.notes}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy === b.id} onClick={() => act(b, 'approve')} className="bg-emerald-600 hover:bg-emerald-700">אשר וחסום שולחן</Button>
                    <Button size="sm" disabled={busy === b.id} variant="outline" onClick={() => act(b, 'reject')} className="text-red-600">דחה</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {decided.length > 0 && (
          <details className="mt-4">
            <summary className="text-xs text-muted-foreground cursor-pointer">היסטוריה ({decided.length})</summary>
            <div className="space-y-1 mt-2">
              {decided.slice(0, 20).map((b) => (
                <div key={b.id} className="text-xs flex items-center justify-between border-b py-1">
                  <span>{b.customer_name} — {b.event_date} — ₪{b.total_ils}</span>
                  <Badge className={b.approval_status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>{b.approval_status === 'approved' ? 'אושר' : 'נדחה'}</Badge>
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

export default function EventsPrivatePage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.listEventLeads({});
      setLeads(res?.leads || []);
    } catch (e) {
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  // Auto-refresh every 20 seconds so new leads / closed events show up without manual click.
  useEffect(() => {
    const id = setInterval(() => { loadAll(); }, 20000);
    return () => clearInterval(id);
  }, [loadAll]);

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarHeart className="w-6 h-6 text-emerald-600" /> אירועים פרטיים — עלינא
          </h1>
          <p className="text-sm text-muted-foreground mt-1">סוכן סיווג לאירועים פרטיים. לידים שמגיעים דרך הקישור מופיעים כאן.</p>
        </div>
        <Button variant="outline" onClick={loadAll} disabled={loading}><RefreshCw className="w-4 h-4 ml-1" /> רענן</Button>
      </div>

      <EventsLinkCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Flame className="w-4 h-4 text-red-500" /> לידים אחרונים</CardTitle>
          <CardDescription>לידים שעברו בצ׳אט הסוכן. לחץ על מספר טלפון כדי לחייג.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : leads.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              עדיין אין לידים. שתפו את הקישור למעלה — כשמישהו ישלים את הצ׳אט, הוא יופיע כאן.
            </div>
          ) : (
            <div className="space-y-2">
              {leads.map((l) => {
                const status = STATUS[l.status] || { label: l.status || '—', cls: '' };
                return (
                  <div key={l.id} className="border rounded-lg p-3 bg-white hover:bg-slate-50/50 transition">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="text-sm flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <strong>{l.contact_name || 'ללא שם'}</strong>
                          {l.contact_phone && <a href={`tel:${l.contact_phone}`} className="text-blue-600 hover:underline">📞 {l.contact_phone}</a>}
                          {scoreBadge(l.score)}
                          <Badge className={status.cls}>{status.label}</Badge>
                        </div>
                        <div className="text-xs text-slate-600 mt-1">
                          {l.event_date && <>📅 {l.event_date}{l.hours_window ? ` · ${l.hours_window}` : ''} · </>}
                          {l.event_type && <>🎉 {l.event_type} · </>}
                          {l.guest_count != null && <>👥 {l.guest_count} · </>}
                          {l.budget_per_person && <>💰 ₪{l.budget_per_person}/סועד · </>}
                          📥 {l.source || '—'} · {fmt(l.created_date)}
                        </div>
                        {l.ai_summary && (
                          <div className="mt-2 p-2 bg-emerald-50 border border-emerald-100 rounded text-xs text-emerald-900">
                            <span className="font-bold">🧠 סיכום שיחה: </span>{l.ai_summary}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <BookingsCard />
    </div>
  );
}
