import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, RefreshCw, Sparkles, CalendarHeart, AlertTriangle, CheckCircle2, Flame, Copy, Check, ExternalLink, QrCode } from 'lucide-react';
import { CampaignUnit, Lead, Agent } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import toast from 'react-hot-toast';

const UNIT_ID = 'UNIT_EVENTS_PRIVATE';

const STATUS_LABELS = {
  NEW: { label: 'חדש', cls: 'bg-slate-100 text-slate-700' },
  QUALIFIED: { label: 'מסווג', cls: 'bg-orange-100 text-orange-800' },
  QUOTED: { label: 'הצעה נשלחה', cls: 'bg-blue-100 text-blue-800' },
  BOOKED: { label: 'נסגר ✓', cls: 'bg-green-100 text-green-800' },
  LOST: { label: 'אבד', cls: 'bg-slate-200 text-slate-600' },
  COLD: { label: 'קר', cls: 'bg-slate-100 text-slate-500' },
};

function fmt(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function scoreBadge(score) {
  if (score == null) return <Badge variant="outline">—</Badge>;
  if (score >= 60) return <Badge className="bg-red-100 text-red-700"><Flame className="w-3 h-3 ml-1 inline" />חם {score}</Badge>;
  if (score >= 30) return <Badge className="bg-amber-100 text-amber-800">חמים {score}</Badge>;
  return <Badge className="bg-slate-100 text-slate-600">קר {score}</Badge>;
}

const UTM_SOURCES = [
  { key: 'general',   label: 'כללי (בלי תיוג)',  utm: '' },
  { key: 'facebook',  label: 'פייסבוק',           utm: 'facebook' },
  { key: 'instagram', label: 'אינסטגרם',          utm: 'instagram' },
  { key: 'google',    label: 'גוגל',              utm: 'google' },
  { key: 'tiktok',    label: 'טיקטוק',            utm: 'tiktok' },
  { key: 'whatsapp',  label: 'וואטסאפ אישי',      utm: 'whatsapp' },
  { key: 'qr',        label: 'QR במסעדה',          utm: 'qr_print' },
];

const PUBLIC_BASE_URL = 'https://topalena.com/EventsInquiry';

function withUtm(utm) {
  return utm ? `${PUBLIC_BASE_URL}?utm_source=${encodeURIComponent(utm)}` : PUBLIC_BASE_URL;
}

function QualifierLinkCard() {
  const [sourceKey, setSourceKey] = useState('general');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const src = UTM_SOURCES.find((s) => s.key === sourceKey) || UTM_SOURCES[0];
  const link = withUtm(src.utm);

  const message =
    `היי 🌿 מסעדת עלינא — אירועים פרטיים\n` +
    `שמחים לארח אצלנו את האירוע שלכם. דברו עם העוזרת הדיגיטלית (5 שאלות קצרות) ונחזור אליכם עם הצעה מותאמת:\n\n` +
    `${link}`;

  const copy = (text, setter) => {
    try { navigator.clipboard.writeText(text); } catch {}
    setter(true);
    setTimeout(() => setter(false), 2200);
  };

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(link)}`;

  return (
    <Card className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white" dir="rtl">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold mb-1">🌿 סוכן אירועים של עלינא</h3>
            <p className="text-emerald-100 text-sm">
              שתפו את הקישור במודעות/סטוריז/QR — הסוכן בדפדפן מנהל את שיחת הסיווג ושומר את הפרטים.
            </p>
          </div>
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>

        <label className="block text-xs text-emerald-100 mb-1">מקור הפנייה (לתיוג קמפיין):</label>
        <select
          value={sourceKey}
          onChange={(e) => setSourceKey(e.target.value)}
          className="w-full bg-white/15 border border-white/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/50 mb-3"
        >
          {UTM_SOURCES.map((s) => (
            <option key={s.key} value={s.key} className="text-slate-800">{s.label}</option>
          ))}
        </select>

        <div className="bg-white/10 rounded-lg p-3 mb-3 flex items-center gap-2">
          <a href={link} target="_blank" rel="noopener noreferrer" className="text-white underline text-sm truncate flex-1 text-left" dir="ltr">
            {link}
          </a>
          <button
            onClick={() => copy(link, setCopiedLink)}
            className="flex-shrink-0 flex items-center gap-1 bg-white/20 hover:bg-white/30 text-white text-xs font-bold py-1.5 px-2 rounded"
            title="העתק קישור"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div className="flex gap-2 mb-3 flex-wrap">
          <button
            onClick={() => copy(message, setCopiedMsg)}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 text-white font-bold py-2 px-3 rounded-lg text-sm"
          >
            {copiedMsg ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copiedMsg ? 'הועתק!' : 'העתק הודעה מוכנה'}
          </button>
          <button
            onClick={() => window.open(link, '_blank')}
            className="flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 text-white font-bold py-2 px-3 rounded-lg text-sm"
            title="פתח בדפדפן"
          >
            <ExternalLink className="w-4 h-4" /> פתח
          </button>
          <button
            onClick={() => setShowQr((v) => !v)}
            className="flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 text-white font-bold py-2 px-3 rounded-lg text-sm"
            title="הצג QR להדפסה"
          >
            <QrCode className="w-4 h-4" /> QR
          </button>
        </div>

        {showQr && (
          <div className="bg-white rounded-xl p-4 flex flex-col items-center mb-2">
            <img src={qrSrc} alt="QR" className="w-48 h-48" />
            <div className="text-xs text-slate-600 mt-2 text-center">סרקו את הקוד כדי להגיע ישירות לסוכן</div>
          </div>
        )}

        <p className="text-emerald-200 text-xs mt-2 text-center">
          💡 כל מקור שונה — לינק נפרד עם <code className="bg-white/10 px-1 rounded">utm_source</code>. המקור נשמר אוטומטית על כל ליד נכנס.
        </p>
      </CardContent>
    </Card>
  );
}

export default function EventsPrivatePage() {
  const [unit, setUnit] = useState(null);
  const [leads, setLeads] = useState([]);
  const [crew, setCrew] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [units, leadsRows, agents] = await Promise.all([
        CampaignUnit.filter({ unit_id: UNIT_ID }).catch(() => []),
        Lead.filter({ source_unit: UNIT_ID }, '-created_date', 100).catch(() => []),
        Agent.list().catch(() => []),
      ]);
      setUnit(units?.[0] || null);
      setLeads(leadsRows || []);
      setCrew((agents || []).filter(a => (a.config?.unit_id || '') === UNIT_ID));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onInitialize = async () => {
    setSeeding(true);
    try {
      const res = await base44.functions.seedUnitEventsPrivate({});
      if (res?.success) {
        toast.success('יחידת אירועים פרטיים אותחלה בהצלחה');
      } else {
        toast.error('האתחול נכשל: ' + (res?.error || 'שגיאה לא ידועה'));
      }
      await loadAll();
    } catch (e) {
      toast.error('שגיאה: ' + (e?.message || String(e)));
    } finally {
      setSeeding(false);
    }
  };

  const hot = leads.filter(l => (l.score ?? 0) >= 60);
  const warm = leads.filter(l => (l.score ?? 0) >= 30 && (l.score ?? 0) < 60);
  const cold = leads.filter(l => (l.score ?? 0) < 30);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarHeart className="w-6 h-6 text-emerald-600" />
            אירועים פרטיים — עלינא
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            יחידת הקמפיין שמייצרת לידים לאירועים פרטיים, מסווגת אותם ב-WhatsApp, ושולחת לידים חמים ל-Pushover ול-Agent Inbox.
          </p>
        </div>
        <Button variant="outline" onClick={loadAll} disabled={loading}>
          <RefreshCw className="w-4 h-4 ml-1" /> רענן
        </Button>
      </div>

      {!unit && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <AlertTriangle className="w-5 h-5" />
              היחידה עדיין לא אותחלה
            </CardTitle>
            <CardDescription className="text-amber-800">
              לחץ על הכפתור כדי ליצור את רשומת היחידה + 5 סוכני ה-Crew (Designer / Creative / Audience Router / Campaign Builder / Optimizer) במצב רדום.
              הפעולה בטוחה לחזרה (idempotent).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={onInitialize} disabled={seeding} className="bg-emerald-600 hover:bg-emerald-700">
              {seeding ? <><Loader2 className="w-4 h-4 ml-1 animate-spin" /> מאתחל…</> : <><Sparkles className="w-4 h-4 ml-1" /> אתחל יחידה</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {unit && <QualifierLinkCard />}

      {unit && (
        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">סטטוס יחידה</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div>שם: <strong>{unit.unit_name}</strong></div>
              <div>סטטוס: <Badge variant="outline">{unit.status}</Badge></div>
              <div>בריאות: <Badge className={unit.health === 'GREEN' ? 'bg-green-100 text-green-800' : unit.health === 'YELLOW' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}>{unit.health}</Badge></div>
              <div>יעד חודשי: {unit.target_outcome?.kpi_target_monthly || 0} אירועים</div>
              <div>תקציב חודשי: ₪{unit.budget?.monthly_ils || 0} (הוצא: ₪{unit.budget?.spent_mtd_ils || 0})</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">צוות הסוכנים ({crew.length}/5)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {crew.length === 0 && <div className="text-muted-foreground">לא נמצאו סוכנים</div>}
              {crew.map(a => (
                <div key={a.codename} className="flex items-center justify-between">
                  <span>{a.codename}</span>
                  <Badge variant={a.status === 'LIVE' ? 'default' : 'outline'}>{a.status}</Badge>
                </div>
              ))}
              <Button size="sm" variant="ghost" onClick={onInitialize} disabled={seeding} className="mt-2 w-full">
                <RefreshCw className="w-3 h-3 ml-1" /> רענן/אתחל מחדש
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">סיכום לידים</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between"><span>🔥 חמים (≥60)</span><strong>{hot.length}</strong></div>
              <div className="flex justify-between"><span>חמימים (30-59)</span><strong>{warm.length}</strong></div>
              <div className="flex justify-between"><span>קרים (&lt;30)</span><strong>{cold.length}</strong></div>
              <div className="flex justify-between border-t pt-1 mt-1"><span>סה״כ</span><strong>{leads.length}</strong></div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Flame className="w-4 h-4 text-red-500" /> לידים אחרונים
          </CardTitle>
          <CardDescription>
            לידים שמגיעים דרך הסוכן events_qualifier_agent ב-WhatsApp. לחץ על מספר טלפון כדי לפתוח שיחה.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leads.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <div>עדיין אין לידים. כשהסוכן יקבל פנייה ראשונה ב-WhatsApp, היא תופיע כאן.</div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>שם</TableHead>
                  <TableHead>טלפון</TableHead>
                  <TableHead>תאריך אירוע</TableHead>
                  <TableHead>סוג</TableHead>
                  <TableHead>אורחים</TableHead>
                  <TableHead>תקציב/סועד</TableHead>
                  <TableHead>ציון</TableHead>
                  <TableHead>סטטוס</TableHead>
                  <TableHead>נכנס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map(l => {
                  const q = l.qualifier_answers || {};
                  const status = STATUS_LABELS[l.status] || { label: l.status, cls: '' };
                  return (
                    <TableRow key={l.id}>
                      <TableCell>{l.contact_name || '—'}</TableCell>
                      <TableCell>
                        {l.contact_phone ? (
                          <a href={`https://wa.me/${l.contact_phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                            {l.contact_phone}
                          </a>
                        ) : '—'}
                      </TableCell>
                      <TableCell>{q.event_date || '—'}</TableCell>
                      <TableCell>{q.event_type || '—'}</TableCell>
                      <TableCell>{q.guest_count ?? '—'}</TableCell>
                      <TableCell>{q.budget_per_person ? `₪${q.budget_per_person}` : '—'}</TableCell>
                      <TableCell>{scoreBadge(l.score)}</TableCell>
                      <TableCell><Badge className={status.cls}>{status.label}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmt(l.created_date)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground border-t pt-3">
        🔒 בשלב הזה הסוכן רק <strong>מסווג</strong> לידים — הוא לא מצטט מחירים. סגירה ידנית עד שיועלה Phase C.
      </div>
    </div>
  );
}
