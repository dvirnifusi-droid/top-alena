import React, { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Copy, Check, ExternalLink, Sparkles, QrCode } from 'lucide-react';

// Pre-defined UTM sources. Choosing one appends ?utm_source=<value> to the
// candidate link so the backend can save it onto JobCandidate.source —
// later you'll see "מקור: instagram" etc. on each candidate.
const SOURCES = [
  { key: 'general',   label: 'כללי (בלי תיוג)', utm: '' },
  { key: 'facebook',  label: 'פייסבוק',          utm: 'facebook' },
  { key: 'instagram', label: 'אינסטגרם',         utm: 'instagram' },
  { key: 'google',    label: 'גוגל',             utm: 'google' },
  { key: 'tiktok',    label: 'טיקטוק',           utm: 'tiktok' },
  { key: 'whatsapp',  label: 'וואטסאפ אישי',     utm: 'whatsapp' },
  { key: 'qr',        label: 'QR במסעדה',         utm: 'qr_print' },
];

const BASE_URL = 'https://topalena.com/apply';

function withUtm(utm) {
  return utm ? `${BASE_URL}?utm_source=${encodeURIComponent(utm)}` : BASE_URL;
}

export default function RecruitmentLinkCard() {
  const [sourceKey, setSourceKey] = useState('general');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const src = SOURCES.find((s) => s.key === sourceKey) || SOURCES[0];
  const link = withUtm(src.utm);

  const message =
    `היי, ברוך/ה הבא/ה לעלינא 🌿\n` +
    `נשמח שתעבור/י ראיון התאמה ראשוני עם הסוכן הדיגיטלי שלנו — לוקח ~3 דקות:\n\n` +
    `${link}`;

  const copy = async (text, setFlag) => {
    try { await navigator.clipboard.writeText(text); }
    catch { /* clipboard blocked — silent */ }
    setFlag(true);
    setTimeout(() => setFlag(false), 2200);
  };

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(link)}`;

  return (
    <Card className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white hover:shadow-xl transition-all duration-300" dir="rtl">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold mb-1">🌿 סוכן גיוס של עלינא</h3>
            <p className="text-emerald-100 text-sm">
              שלח את הקישור למועמדים — הסוכן בדפדפן מנהל ראיון התאמה ושומר את הפרטים
            </p>
          </div>
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>

        {/* Source picker (UTM) */}
        <label className="block text-xs text-emerald-100 mb-1">מקור הפנייה (לתיוג קמפיין):</label>
        <select
          value={sourceKey}
          onChange={(e) => setSourceKey(e.target.value)}
          className="w-full bg-white/15 border border-white/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/50 mb-3"
        >
          {SOURCES.map((s) => (
            <option key={s.key} value={s.key} className="text-slate-800">{s.label}</option>
          ))}
        </select>

        {/* Link row */}
        <div className="bg-white/10 rounded-lg p-3 mb-3 flex items-center gap-2">
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white underline text-sm truncate flex-1 text-left direction-ltr"
            dir="ltr"
          >
            {link}
          </a>
          <button
            onClick={() => copy(link, setCopiedLink)}
            className="flex-shrink-0 flex items-center gap-1 bg-white/20 hover:bg-white/30 text-white text-xs font-bold py-1.5 px-2 rounded transition"
            title="העתק קישור"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Action row */}
        <div className="flex gap-2 mb-3 flex-wrap">
          <button
            onClick={() => copy(message, setCopiedMsg)}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 text-white font-bold py-2 px-3 rounded-lg transition text-sm"
          >
            {copiedMsg ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copiedMsg ? 'הועתק!' : 'העתק הודעה מוכנה'}
          </button>
          <button
            onClick={() => window.open(link, '_blank')}
            className="flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 text-white font-bold py-2 px-3 rounded-lg transition text-sm"
            title="פתח בדפדפן"
          >
            <ExternalLink className="w-4 h-4" />
            פתח
          </button>
          <button
            onClick={() => setShowQr((v) => !v)}
            className="flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 text-white font-bold py-2 px-3 rounded-lg transition text-sm"
            title="הצג QR להדפסה"
          >
            <QrCode className="w-4 h-4" />
            QR
          </button>
        </div>

        {/* QR (toggle) */}
        {showQr && (
          <div className="bg-white rounded-xl p-3 flex flex-col items-center mb-3">
            <img src={qrSrc} alt="QR לקישור הגיוס" className="w-44 h-44" />
            <p className="text-slate-700 text-xs mt-2 text-center">
              סרוק → הצ'אט נפתח ישר ({src.label})
            </p>
          </div>
        )}

        <p className="text-emerald-100 text-xs text-center leading-relaxed">
          💡 כל מקור שונה — לינק נפרד עם <code className="bg-white/10 px-1 rounded">utm_source</code>. המקור נשמר אוטומטית על כל מועמד שיגיע.
        </p>
      </CardContent>
    </Card>
  );
}
