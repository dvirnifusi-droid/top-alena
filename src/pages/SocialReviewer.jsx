// "בוחן סושיאל" — paste a post/caption the social agency made; the AI marketing
// manager grades it against the brand and returns an improved version.
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Copy, Check } from 'lucide-react';

const PLATFORMS = [['instagram', 'אינסטגרם'], ['facebook', 'פייסבוק'], ['tiktok', 'טיקטוק'], ['story', 'סטורי']];
const withHash = (tags) => (tags || []).map((h) => (String(h).startsWith('#') ? h : '#' + h)).join(' ');

export default function SocialReviewer() {
  const [text, setText] = useState('');
  const [platform, setPlatform] = useState('instagram');
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  const review = async () => {
    if (!text.trim()) return;
    setLoading(true); setErr(''); setRes(null);
    try {
      const r = await base44.functions.reviewSocialContent({ text, platform });
      setRes(r?.data || r || {});
    } catch (e) { setErr(e?.message || 'הבדיקה נכשלה'); }
    finally { setLoading(false); }
  };

  const scoreColor = (s) => (s >= 8 ? 'text-emerald-600' : s >= 5 ? 'text-amber-600' : 'text-red-600');

  return (
    <div dir="rtl" className="space-y-4 max-w-2xl">
      <Card className="p-4 space-y-3">
        <div className="text-sm text-slate-600">הדבק פוסט/כיתוב שחברת הסושיאל הכינה — מנהל השיווק ה-AI יבחן אותו מול המותג שלך ויציע גרסה משופרת.</div>
        <div className="flex gap-2 flex-wrap">
          {PLATFORMS.map(([v, l]) => (
            <button key={v} type="button" onClick={() => setPlatform(v)}
              className={`px-3 py-1.5 rounded-lg border text-sm ${platform === v ? 'border-[#A04A2E] bg-orange-50 text-[#A04A2E] font-semibold' : 'border-slate-200 text-slate-600'}`}>{l}</button>
          ))}
        </div>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="הדבק כאן את הכיתוב של הפוסט…" />
        <Button onClick={review} disabled={loading || !text.trim()} className="bg-[#A04A2E] hover:bg-[#7A3722]">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'בחן את התוכן'}
        </Button>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </Card>

      {res && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className={`text-4xl font-bold ${scoreColor(res.score)}`}>{res.score}<span className="text-lg text-slate-400">/10</span></div>
            <div className="text-sm text-slate-700">{res.verdict}</div>
          </div>
          {res.strengths?.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-emerald-700 mb-1">✅ חזק</div>
              <ul className="text-sm text-slate-700 list-disc pr-5 space-y-0.5">{res.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
          {res.issues?.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-red-700 mb-1">⚠️ לשיפור</div>
              <ul className="text-sm text-slate-700 list-disc pr-5 space-y-0.5">{res.issues.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
          {res.rewrite && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-semibold text-[#44512C]">✍️ הגרסה המשופרת</div>
                <Button size="sm" variant="outline" onClick={() => {
                  try { navigator.clipboard?.writeText(res.rewrite + (res.hashtags?.length ? '\n\n' + withHash(res.hashtags) : '')); } catch { /* ignore */ }
                  setCopied(true); setTimeout(() => setCopied(false), 1500);
                }}>
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} העתק
                </Button>
              </div>
              <div className="bg-slate-50 border rounded-lg p-3 text-sm whitespace-pre-wrap">{res.rewrite}</div>
              {res.hashtags?.length > 0 && <div className="text-xs text-blue-600 mt-1">{withHash(res.hashtags)}</div>}
            </div>
          )}
          {res.best_time && <div className="text-xs text-slate-500">🕒 זמן פרסום מומלץ: {res.best_time}</div>}
        </Card>
      )}
    </div>
  );
}
