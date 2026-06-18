import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, RefreshCw, Sparkles, CalendarHeart, Copy, Check, ExternalLink, QrCode, Flame, CheckCircle2, Trash2, Search, Filter, MessageCircle, Phone, X, CalendarDays } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

// New flow (June 2026): Dana is info-only — she never creates an EventBooking.
// Every closed lead lands in EventLead with callback_stage='pending'. Manager works
// the inbox: call → "התקשרתי", send price → "הצעת מחיר", signed → "נסגר", out → "לא רלוונטי".
// This card is the manager's primary daily inbox.
const CALLBACK_STAGES = {
  pending:   { label: '🟠 מחכה לטלפון', cls: 'bg-orange-100 text-orange-800', accent: 'border-orange-300' },
  contacted: { label: '📞 דיברנו',       cls: 'bg-blue-100 text-blue-800',     accent: 'border-blue-300' },
  quoted:    { label: '💰 הצעת מחיר',   cls: 'bg-purple-100 text-purple-800', accent: 'border-purple-300' },
  won:       { label: '✅ נסגר',         cls: 'bg-emerald-100 text-emerald-800', accent: 'border-emerald-400' },
  lost:      { label: '❌ לא רלוונטי',  cls: 'bg-slate-100 text-slate-500',    accent: 'border-slate-300' },
};

function PendingCallbackCard() {
  const [leads, setLeads] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(null);
  const [view, setView] = React.useState('active'); // 'active' (pending+contacted+quoted) or 'closed' (won+lost)

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await base44.functions.listEventLeads({});
      const arr = r?.data?.leads || r?.leads || [];
      // Only leads Dana finished collecting — needs at least a phone.
      setLeads(arr.filter((l) => l.contact_phone));
    } catch { setLeads([]); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => {
    const id = setInterval(() => { load(); }, 120000);
    return () => clearInterval(id);
  }, [load]);

  const setStage = async (lead, stage) => {
    let notes = '';
    if (stage === 'lost') {
      notes = window.prompt('סיבת ביטול / "לא רלוונטי" (אופציונלי):') || '';
    } else if (stage === 'quoted') {
      notes = window.prompt('פרט/י הצעת מחיר ששלחת (סכום, חבילה, אופציונלי):') || '';
    }
    setBusy(lead.id);
    try {
      await base44.functions.setLeadCallbackStage({ lead_id: lead.id, stage, notes });
      await load();
    } catch (e) { alert('שמירה נכשלה: ' + (e?.message || '')); }
    finally { setBusy(null); }
  };

  const ACTIVE = ['pending', 'contacted', 'quoted'];
  const CLOSED = ['won', 'lost'];
  // Only show leads that have a callback_stage (i.e. Dana actually finished gathering info).
  // Leads with no callback_stage are still in collection / abandoned — they show in the
  // bottom "לידים אחרונים" list, not here.
  const active = leads.filter((l) => ACTIVE.includes(l.callback_stage));
  const closed = leads.filter((l) => CLOSED.includes(l.callback_stage));
  const shown = view === 'active' ? active : closed;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-orange-500" /> אירועים שמחכים שמנהל יתקשר ללקוח</CardTitle>
        <CardDescription>דנה אספה את הפרטים — עכשיו דורש שיחת טלפון מהמנהל. סמן <strong>"📞 התקשרתי"</strong> אחרי השיחה, <strong>"💰 הצעת מחיר"</strong> כששלחת מחיר, <strong>"✅ נסגר"</strong> כשהלקוח חתם.</CardDescription>
        <div className="flex gap-2 pt-2">
          <Button size="sm" variant={view === 'active' ? 'default' : 'outline'} onClick={() => setView('active')} className={view === 'active' ? 'bg-orange-600 hover:bg-orange-700' : ''}>
            🔥 פעילים ({active.length})
          </Button>
          <Button size="sm" variant={view === 'closed' ? 'default' : 'outline'} onClick={() => setView('closed')}>
            📁 סגורים ({closed.length})
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {view === 'active' ? 'אין לידים שמחכים. כשדנה תסיים שיחה — תופיע כאן.' : 'אין לידים סגורים עדיין.'}
          </p>
        ) : (
          <div className="space-y-3">
            {shown.map((l) => {
              const stage = CALLBACK_STAGES[l.callback_stage] || CALLBACK_STAGES.pending;
              const weekday = (() => {
                if (!l.event_date) return null;
                try {
                  const d = new Date(l.event_date + 'T00:00');
                  return ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'][d.getDay()];
                } catch { return null; }
              })();
              const phoneClean = (l.contact_phone || '').replace(/\D/g, '');
              const waNumber = phoneClean.startsWith('0') ? '972' + phoneClean.slice(1) : phoneClean;
              const isFresh = (() => {
                try { return (Date.now() - new Date(l.created_date).getTime()) < 60 * 60 * 1000; }
                catch { return false; }
              })();
              const locationTxt = (() => {
                if (l.location === 'restaurant') return 'במסעדה (עלינא)';
                if (l.location_details) return `אירוע חוץ — ${l.location_details}`;
                if (l.location === 'external') return 'אירוע חוץ';
                return null;
              })();
              return (
                <div key={l.id} className={`border-2 ${stage.accent} rounded-xl p-4 bg-orange-50/30`}>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 flex-wrap mb-3 pb-2 border-b border-orange-200">
                    <div>
                      <div className="text-lg font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                        👤 {l.contact_name || 'ללא שם — שאל בטלפון'}
                        {isFresh && <Badge className="bg-red-500 text-white text-xs animate-pulse">חדש 🔥</Badge>}
                      </div>
                      {l.contact_phone && (
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <a href={`tel:${l.contact_phone}`} className="text-[#44512C] font-semibold hover:underline text-base">📞 {l.contact_phone}</a>
                          <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer" className="text-green-700 hover:underline text-sm flex items-center gap-1"><MessageCircle className="w-3 h-3" /> WhatsApp</a>
                        </div>
                      )}
                    </div>
                    <Badge className={stage.cls + ' font-bold'}>{stage.label}</Badge>
                  </div>

                  {/* Details grid */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm mb-3">
                    {l.event_date && <div><span className="text-slate-500">📅 תאריך:</span> <strong>{l.event_date}{weekday ? ` (יום ${weekday})` : ''}</strong></div>}
                    {l.event_time && <div><span className="text-slate-500">🕒 שעה:</span> <strong>{l.event_time}</strong></div>}
                    {l.guest_count != null && <div><span className="text-slate-500">👥 כמות אורחים:</span> <strong>{l.guest_count}</strong></div>}
                    {l.event_type && <div><span className="text-slate-500">🎉 סוג אירוע:</span> <strong>{l.event_type}</strong></div>}
                    {locationTxt && <div className="col-span-2"><span className="text-slate-500">📍 מיקום:</span> <strong>{locationTxt}</strong></div>}
                    {l.hours_window && <div className="col-span-2"><span className="text-slate-500">🕓 חלון זמן:</span> {l.hours_window}</div>}
                    {l.budget_per_person != null && <div className="col-span-2"><span className="text-slate-500">💰 תקציב לסועד:</span> <strong>₪{l.budget_per_person}</strong></div>}
                  </div>

                  {l.special_requests && (
                    <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900">
                      <span className="font-bold">⚠️ דרישות מיוחדות: </span>{l.special_requests}
                    </div>
                  )}

                  {/* Meta */}
                  <div className="text-xs text-slate-500 mb-3">
                    📥 מקור: <strong>{l.source || '—'}</strong> · 🆔 {l.id.slice(-8)} · נסגר ב-{fmt(l.created_date)}
                    {l.callback_at && <> · עודכן {fmt(l.callback_at)}</>}
                  </div>

                  {l.ai_summary && (
                    <div className="mb-3 p-2 bg-emerald-100 border border-emerald-200 rounded text-xs text-emerald-900">
                      <span className="font-bold">🧠 סיכום שיחה: </span>{l.ai_summary}
                    </div>
                  )}

                  {l.callback_notes && (
                    <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-900">
                      <span className="font-bold">📝 הערות מנהל: </span>{l.callback_notes}
                    </div>
                  )}

                  {/* Actions — adapt to current stage */}
                  {view === 'active' && (
                    <div className="flex gap-2 flex-wrap pt-2 border-t border-orange-200">
                      {l.callback_stage === 'pending' && (
                        <>
                          <Button size="sm" disabled={busy === l.id} onClick={() => setStage(l, 'contacted')} className="bg-blue-600 hover:bg-blue-700 flex-1">
                            {busy === l.id ? <Loader2 className="w-4 h-4 animate-spin" /> : '📞 התקשרתי'}
                          </Button>
                          <Button size="sm" disabled={busy === l.id} onClick={() => setStage(l, 'quoted')} className="bg-purple-600 hover:bg-purple-700">💰 הצעת מחיר</Button>
                          <Button size="sm" disabled={busy === l.id} variant="outline" onClick={() => setStage(l, 'lost')} className="text-red-600 border-red-300">❌ לא רלוונטי</Button>
                        </>
                      )}
                      {l.callback_stage === 'contacted' && (
                        <>
                          <Button size="sm" disabled={busy === l.id} onClick={() => setStage(l, 'quoted')} className="bg-purple-600 hover:bg-purple-700 flex-1">💰 שלחתי הצעת מחיר</Button>
                          <Button size="sm" disabled={busy === l.id} onClick={() => setStage(l, 'won')} className="bg-emerald-600 hover:bg-emerald-700">✅ נסגר</Button>
                          <Button size="sm" disabled={busy === l.id} variant="outline" onClick={() => setStage(l, 'lost')} className="text-red-600 border-red-300">❌ לא רלוונטי</Button>
                        </>
                      )}
                      {l.callback_stage === 'quoted' && (
                        <>
                          <Button size="sm" disabled={busy === l.id} onClick={() => setStage(l, 'won')} className="bg-emerald-600 hover:bg-emerald-700 flex-1">✅ נסגר וחתם</Button>
                          <Button size="sm" disabled={busy === l.id} variant="outline" onClick={() => setStage(l, 'contacted')}>↩ חזור ל"דיברנו"</Button>
                          <Button size="sm" disabled={busy === l.id} variant="outline" onClick={() => setStage(l, 'lost')} className="text-red-600 border-red-300">❌ לא רלוונטי</Button>
                        </>
                      )}
                    </div>
                  )}
                  {view === 'closed' && (
                    <div className="flex gap-2 pt-2 border-t border-slate-200">
                      <Button size="sm" disabled={busy === l.id} variant="outline" onClick={() => setStage(l, 'pending')}>↩ החזר לפעילים</Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BookingsCard() {
  const [bookings, setBookings] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(null);
  const [confirmModal, setConfirmModal] = React.useState(null); // approved booking awaiting customer notification

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await base44.functions.listEventBookings({});
      setBookings(r?.data?.bookings || r?.bookings || []);
    } catch { setBookings([]); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => {
    const id = setInterval(() => { load(); }, 120000); // 2 minutes, matches the parent
    return () => clearInterval(id);
  }, [load]);

  const act = async (booking, action) => {
    const notes = action === 'reject' ? (window.prompt('סיבת דחייה (אופציונלי):') || '') : '';
    setBusy(booking.id);
    try {
      const fn = action === 'approve' ? 'approveEventBooking' : 'rejectEventBooking';
      await base44.functions[fn]({ booking_id: booking.id, notes });
      await load();
      // On approve: open the customer-message modal so the manager can send a confirmation.
      if (action === 'approve') setConfirmModal(booking);
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
          <div className="space-y-3">
            {pending.map((b) => {
              const weekday = (() => {
                if (!b.event_date) return null;
                try {
                  const d = new Date(b.event_date + 'T00:00');
                  return ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'][d.getDay()];
                } catch { return null; }
              })();
              const tableDuration = b.selected_menu?.table_duration_hours || 3;
              const tableEndTime = (() => {
                if (!b.event_time) return null;
                try {
                  const [h, m] = b.event_time.split(':').map(Number);
                  const endH = (h + tableDuration) % 24;
                  return `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                } catch { return null; }
              })();
              return (
                <div key={b.id} className="border-2 border-emerald-300 rounded-xl p-4 bg-emerald-50/50">
                  {/* Header — customer identity */}
                  <div className="flex items-start justify-between gap-2 flex-wrap mb-3 pb-2 border-b border-emerald-200">
                    <div>
                      <div className="text-lg font-bold text-emerald-900">
                        👤 {b.customer_name || 'ללא שם — שאל בטלפון'}
                      </div>
                      {b.customer_phone && (
                        <a href={`tel:${b.customer_phone}`} className="text-[#44512C] font-semibold hover:underline text-base">
                          📞 {b.customer_phone}
                        </a>
                      )}
                    </div>
                    {b.short_notice && <Badge className="bg-amber-100 text-amber-900 font-bold">⚡ Short-notice</Badge>}
                  </div>

                  {/* Event details grid */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm mb-3">
                    <div><span className="text-slate-500">📅 תאריך:</span> <strong>{b.event_date}{weekday ? ` (יום ${weekday})` : ''}</strong></div>
                    <div><span className="text-slate-500">🕒 שעה:</span> <strong>{b.event_time || '—'}{tableEndTime ? ` עד ${tableEndTime}` : ''}</strong></div>
                    <div><span className="text-slate-500">👥 כמות אורחים:</span> <strong>{b.guest_count}</strong></div>
                    <div><span className="text-slate-500">⏱ משך שולחן:</span> <strong>{tableDuration} שעות</strong></div>
                    <div className="col-span-2"><span className="text-slate-500">🍽 חבילה נבחרה:</span> <strong>{b.selected_menu?.name || '— לא צוין, ברר בטלפון'}</strong></div>
                    {b.hours_window && <div className="col-span-2"><span className="text-slate-500">🕓 חלון זמן:</span> {b.hours_window}</div>}
                  </div>

                  {/* Upsells */}
                  {Array.isArray(b.selected_upsells) && b.selected_upsells.length > 0 && (
                    <div className="mb-3 p-2 bg-white rounded border border-slate-200 text-sm">
                      <div className="text-xs text-slate-500 mb-1">✨ תוספות נבחרו:</div>
                      <ul className="space-y-0.5">
                        {b.selected_upsells.map((u, i) => (
                          <li key={i} className="text-xs">• {u.name}{u.price ? <span className="text-slate-600"> — ₪{u.price}</span> : ''}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Selected dishes if any */}
                  {Array.isArray(b.selected_dishes) && b.selected_dishes.length > 0 && (
                    <div className="mb-3 p-2 bg-white rounded border border-slate-200 text-xs">
                      <div className="text-slate-500 mb-1">🍴 מנות שנבחרו:</div>
                      <div>{b.selected_dishes.join(' · ')}</div>
                    </div>
                  )}

                  {/* Money summary */}
                  <div className="mb-3 p-2 bg-white rounded border border-slate-200 text-sm flex items-center justify-between">
                    <span><span className="text-slate-500">💰 סה"כ:</span> <strong className="text-emerald-700">₪{b.total_ils || 0}</strong></span>
                    {b.discount_pct ? <span className="text-xs text-amber-700">הנחה {b.discount_pct}%</span> : null}
                    {b.deposit_amount_ils ? <span className="text-xs text-slate-600">פיקדון לגבייה: ₪{b.deposit_amount_ils}</span> : null}
                  </div>

                  {/* Meta */}
                  <div className="text-xs text-slate-500 mb-3">
                    📥 מקור: <strong>{b.source || '—'}</strong> · 🆔 {b.id.slice(-8)} · נסגר ב-{fmt(b.created_date)}
                  </div>

                  {/* AI summary */}
                  {b.notes && (
                    <div className="mb-3 p-2 bg-emerald-100 border border-emerald-200 rounded text-xs text-emerald-900">
                      <span className="font-bold">🧠 סיכום שיחה: </span>{b.notes}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t border-emerald-200">
                    <Button size="sm" disabled={busy === b.id} onClick={() => act(b, 'approve')} className="bg-emerald-600 hover:bg-emerald-700 flex-1">
                      {busy === b.id ? <Loader2 className="w-4 h-4 animate-spin" /> : '✅ אשר וחסום שולחן'}
                    </Button>
                    <Button size="sm" disabled={busy === b.id} variant="outline" onClick={() => act(b, 'reject')} className="text-red-600 border-red-300">
                      ❌ דחה
                    </Button>
                  </div>
                </div>
              );
            })}
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
      {confirmModal && <CustomerConfirmModal booking={confirmModal} onClose={() => setConfirmModal(null)} />}
    </Card>
  );
}

// Modal that opens after the manager approves a booking. Pre-fills a Hebrew confirmation
// message with the event details and offers one-click sending via WhatsApp or SMS, or
// copy-to-clipboard. wa.me / sms: are native deep links — no backend integration needed.
function CustomerConfirmModal({ booking, onClose }) {
  const phoneClean = (booking.customer_phone || '').replace(/\D/g, '');
  const waNumber = phoneClean.startsWith('0') ? '972' + phoneClean.slice(1) : phoneClean;
  const weekday = (() => {
    if (!booking.event_date) return '';
    try {
      const d = new Date(booking.event_date + 'T00:00');
      return ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'][d.getDay()];
    } catch { return ''; }
  })();
  const defaultMsg =
    `שלום ${booking.customer_name || ''} 🌿\n\n` +
    `ההזמנה שלכם אצלנו אושרה ✅\n\n` +
    `📅 ${booking.event_date}${weekday ? ` (יום ${weekday})` : ''}\n` +
    `🕒 ${booking.event_time || ''}\n` +
    `👥 ${booking.guest_count} אורחים\n` +
    `🍽 ${booking.selected_menu?.name || ''}\n` +
    `💰 סה"כ: ₪${booking.total_ils || 0}` +
    (booking.deposit_amount_ils ? `\n💳 פיקדון לגבייה: ₪${booking.deposit_amount_ils}` : '') +
    `\n\nנשמח לראותכם!\n— צוות עלינא`;
  const [msg, setMsg] = React.useState(defaultMsg);
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    try { navigator.clipboard.writeText(msg); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const waLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`;
  const smsLink = `sms:${booking.customer_phone}?body=${encodeURIComponent(msg)}`;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-bold text-lg">📩 שליחת אישור ללקוח</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="text-sm text-slate-600">
            ההזמנה אושרה, השולחן נחסם ב-SeatingSetup. עכשיו שלח/י ללקוח אישור — אפשר לערוך את הטקסט:
          </div>
          <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={10} className="text-sm font-mono" />
          <div className="grid grid-cols-2 gap-2">
            <a href={waLink} target="_blank" rel="noreferrer"
               className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-lg py-3 px-4 font-bold transition">
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </a>
            <a href={smsLink}
               className="flex items-center justify-center gap-2 bg-[#44512C] hover:bg-[#44512C] text-white rounded-lg py-3 px-4 font-bold transition">
              <Phone className="w-4 h-4" /> SMS
            </a>
          </div>
          <button onClick={copy} className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg py-2 font-medium text-sm transition">
            {copied ? <><Check className="w-4 h-4" /> הועתק!</> : <><Copy className="w-4 h-4" /> העתק טקסט</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// Timeline of approved upcoming events. Sorted by date ascending. Owner sees what's coming.
function UpcomingEventsTimeline() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await base44.functions.listUpcomingConfirmedEvents({});
      setEvents(r?.data?.events || r?.events || []);
    } catch { setEvents([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(() => { load(); }, 120000);
    return () => clearInterval(id);
  }, [load]);

  // Group events by date so the timeline reads naturally
  const byDate = events.reduce((acc, e) => {
    const k = e.event_date || 'ללא תאריך';
    (acc[k] = acc[k] || []).push(e);
    return acc;
  }, {});
  const dateKeys = Object.keys(byDate).sort();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="w-4 h-4 text-[#44512C]" /> אירועים מאושרים — הבאים בתור</CardTitle>
        <CardDescription>אירועים שאישרת. ה-Reservation שלהם חסום ב-SeatingSetup. סדר כרונולוגי.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
        ) : dateKeys.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">אין אירועים מאושרים קדימה.</p>
        ) : (
          <div className="space-y-4">
            {dateKeys.map((date) => {
              const weekday = (() => {
                try { return ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'][new Date(date + 'T00:00').getDay()]; }
                catch { return ''; }
              })();
              const isToday = date === today;
              return (
                <div key={date}>
                  <div className={`text-xs font-bold mb-1 pb-1 border-b ${isToday ? 'text-emerald-700 border-emerald-300' : 'text-slate-500 border-slate-200'}`}>
                    📅 {date} {weekday && `(יום ${weekday})`} {isToday && '· היום ⚡'}
                  </div>
                  <div className="space-y-1.5">
                    {byDate[date].map((e) => {
                      const dur = e.selected_menu?.table_duration_hours || 3;
                      const endTime = (() => {
                        if (!e.event_time) return null;
                        try {
                          const [h, m] = e.event_time.split(':').map(Number);
                          return `${String((h + dur) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                        } catch { return null; }
                      })();
                      const phoneClean = (e.customer_phone || '').replace(/\D/g, '');
                      const waNum = phoneClean.startsWith('0') ? '972' + phoneClean.slice(1) : phoneClean;
                      return (
                        <div key={e.id} className="flex items-center gap-3 p-2 bg-[#F4ECD8] border border-[#E8D9B5] rounded-lg text-sm">
                          <div className="font-mono text-blue-900 font-bold text-xs whitespace-nowrap">
                            {e.event_time || '—'}{endTime ? `-${endTime}` : ''}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold truncate">{e.customer_name || 'ללא שם'}</div>
                            <div className="text-xs text-slate-600 truncate">
                              👥 {e.guest_count} · 🍽 {e.selected_menu?.name || '-'} · ₪{e.total_ils || 0}
                            </div>
                          </div>
                          {e.customer_phone && (
                            <div className="flex gap-1 flex-shrink-0">
                              <a href={`tel:${e.customer_phone}`} className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded p-1.5" title="חייג">
                                <Phone className="w-3.5 h-3.5" />
                              </a>
                              <a href={`https://wa.me/${waNum}`} target="_blank" rel="noreferrer" className="bg-white border border-green-300 hover:bg-green-50 text-green-700 rounded p-1.5" title="WhatsApp">
                                <MessageCircle className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function EventsPrivatePage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [diag, setDiag] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [filterSearch, setFilterSearch] = useState('');
  const [busyDelete, setBusyDelete] = useState(null);

  const deleteLead = async (lead) => {
    if (!window.confirm(`למחוק ליד של ${lead.contact_name || lead.contact_phone || lead.id}?`)) return;
    setBusyDelete(lead.id);
    try {
      await base44.functions.deleteEventLead({ lead_id: lead.id });
      setLeads((arr) => arr.filter((x) => x.id !== lead.id));
    } catch (e) {
      window.alert('מחיקה נכשלה: ' + (e?.message || ''));
    } finally { setBusyDelete(null); }
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await base44.functions.listEventLeads({});
      // base44Client wraps as { data, status }.
      setLeads(res?.data?.leads || res?.leads || []);
    } catch (e) {
      setLoadError(e?.message || String(e));
      setLeads([]);
    } finally {
      setLoading(false);
    }
    // Always fetch diagnostics in parallel so we can confirm DB state.
    try {
      const r = await fetch('/api/public/fn/eventsDiagnostics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (r.ok) setDiag(await r.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  // Auto-refresh every 2 minutes — frequent enough for new leads to surface,
  // not so frequent it spams the network / blinks the UI while owner is working.
  useEffect(() => {
    const id = setInterval(() => { loadAll(); }, 120000);
    return () => clearInterval(id);
  }, [loadAll]);

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
          ⚠️ טעינת לידים נכשלה: <code className="bg-white px-1 rounded">{loadError}</code>
          {diag && <div className="mt-1 text-xs text-red-700">למרות זאת ב-DB יש {diag.leads?.total ?? '?'} לידים + {diag.bookings?.total ?? '?'} bookings — בעיית הרשאה / סשן.</div>}
        </div>
      )}
      {!loadError && leads.length === 0 && diag && (diag.leads?.total > 0 || diag.bookings?.total > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
          ⚠️ הדף מציג 0 לידים אבל ב-DB יש {diag.leads?.total} לידים + {diag.bookings?.total} bookings. ייתכן שאתה רואה JS ישן — לחץ <strong>Ctrl+Shift+R</strong> לרענון חזק.
        </div>
      )}
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
          <CardDescription>לידים שעברו בצ׳אט הסוכן. לחץ על מספר טלפון כדי לחייג, על פח כדי למחוק.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap mb-3 pb-3 border-b">
            <div className="flex items-center gap-1 text-xs text-slate-500"><Filter className="w-3 h-3" /> סינון:</div>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border rounded px-2 py-1 text-xs">
              <option value="all">כל הסטטוסים</option>
              <option value="qualified">מסווג / חם</option>
              <option value="warm">חמים</option>
              <option value="new">חדש</option>
              <option value="cold">קר</option>
              <option value="booked">נסגר</option>
            </select>
            <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="border rounded px-2 py-1 text-xs">
              <option value="all">כל המקורות</option>
              <option value="web_chat">web_chat (כללי)</option>
              <option value="facebook">פייסבוק</option>
              <option value="instagram">אינסטגרם</option>
              <option value="google">גוגל</option>
              <option value="tiktok">טיקטוק</option>
              <option value="whatsapp">וואטסאפ</option>
              <option value="qr_print">QR</option>
            </select>
            <div className="relative flex-1 min-w-[160px]">
              <Search className="w-3 h-3 absolute right-2 top-2 text-slate-400" />
              <Input value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder="חיפוש שם / טלפון / סוג אירוע…" className="pr-7 text-xs h-8" />
            </div>
            {(filterStatus !== 'all' || filterSource !== 'all' || filterSearch) && (
              <Button size="sm" variant="ghost" onClick={() => { setFilterStatus('all'); setFilterSource('all'); setFilterSearch(''); }} className="text-xs h-8">נקה</Button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : (() => {
            const q = filterSearch.trim().toLowerCase();
            const filtered = leads.filter((l) => {
              if (filterStatus !== 'all' && (l.status || 'new') !== filterStatus) return false;
              if (filterSource !== 'all' && (l.source || 'web_chat') !== filterSource) return false;
              if (q && !`${l.contact_name || ''} ${l.contact_phone || ''} ${l.event_type || ''} ${l.ai_summary || ''}`.toLowerCase().includes(q)) return false;
              return true;
            });
            if (filtered.length === 0) {
              return (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {leads.length === 0
                    ? 'עדיין אין לידים. שתפו את הקישור למעלה — כשמישהו ישלים את הצ׳אט, הוא יופיע כאן.'
                    : `אין לידים שתואמים את הסינון (סה״כ ${leads.length} לידים).`}
                </div>
              );
            }
            return (
              <div className="space-y-2">
                <div className="text-xs text-slate-500">מוצגים {filtered.length} מתוך {leads.length} לידים</div>
                {filtered.map((l) => {
                  const status = STATUS[l.status] || { label: l.status || '—', cls: '' };
                  return (
                    <div key={l.id} className="border rounded-lg p-3 bg-white hover:bg-slate-50/50 transition">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="text-sm flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <strong>{l.contact_name || 'ללא שם'}</strong>
                            {l.contact_phone && <a href={`tel:${l.contact_phone}`} className="text-[#44512C] hover:underline">📞 {l.contact_phone}</a>}
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
                        <button
                          onClick={() => deleteLead(l)}
                          disabled={busyDelete === l.id}
                          className="text-slate-400 hover:text-red-600 transition flex-shrink-0 p-1"
                          title="מחק ליד"
                        >
                          {busyDelete === l.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      <PendingCallbackCard />
      <UpcomingEventsTimeline />
    </div>
  );
}
