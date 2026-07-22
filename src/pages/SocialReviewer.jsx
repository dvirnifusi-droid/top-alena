// "בוחן סושיאל" — upload the post image and/or paste the caption; the AI
// marketing manager grades it against the brand, explains what's wrong, and
// returns an improved version.
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { UploadFile } from '@/integrations/Core';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Loader2, Copy, Check, Upload, X, Link2 } from 'lucide-react';

const PLATFORMS = [['instagram', 'אינסטגרם'], ['facebook', 'פייסבוק'], ['tiktok', 'טיקטוק'], ['story', 'סטורי']];
const withHash = (tags) => (tags || []).map((h) => (String(h).startsWith('#') ? h : '#' + h)).join(' ');

export default function SocialReviewer() {
  const [text, setText] = useState('');
  const [platform, setPlatform] = useState('instagram');
  const [imageUrl, setImageUrl] = useState('');
  const [isVideo, setIsVideo] = useState(false);
  const [link, setLink] = useState('');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const video = (file.type || '').startsWith('video/');
    setUploading(true); setErr('');
    try {
      const { file_url } = await UploadFile({ file });
      setImageUrl(file_url); setIsVideo(video);
    } catch (er) { setErr('העלאת הקובץ נכשלה: ' + (er?.message || '')); }
    finally { setUploading(false); }
  };
  const clearMedia = () => { setImageUrl(''); setIsVideo(false); };

  const review = async () => {
    if (!text.trim() && !imageUrl && !link.trim()) { setErr('הדבק טקסט, קישור, או העלה תמונה/סרטון'); return; }
    setLoading(true); setErr(''); setRes(null);
    try {
      const r = await base44.functions.reviewSocialContent({
        text, platform, image_url: imageUrl, link: link.trim(), media_type: isVideo ? 'video' : 'image',
      });
      setRes(r?.data || r || {});
    } catch (e) { setErr(e?.message || 'הבדיקה נכשלה'); }
    finally { setLoading(false); }
  };

  const scoreColor = (s) => (s >= 8 ? 'text-emerald-600' : s >= 5 ? 'text-amber-600' : 'text-red-600');

  return (
    <div dir="rtl" className="space-y-4 max-w-2xl">
      <Card className="p-4 space-y-3">
        <div className="text-sm text-slate-600">העלה תמונה או סרטון של הפוסט, הדבק קישור ו/או את הכיתוב — מנהל השיווק ה-AI יבחן אותם מול המותג שלך ויסביר בדיוק מה לשפר.</div>
        <div className="flex gap-2 flex-wrap">
          {PLATFORMS.map(([v, l]) => (
            <button key={v} type="button" onClick={() => setPlatform(v)}
              className={`px-3 py-1.5 rounded-lg border text-sm ${platform === v ? 'border-[#A04A2E] bg-orange-50 text-[#A04A2E] font-semibold' : 'border-slate-200 text-slate-600'}`}>{l}</button>
          ))}
        </div>

        {imageUrl ? (
          <div className="relative inline-block">
            {isVideo
              ? <video src={imageUrl} controls className="max-h-52 rounded-lg border" />
              : <img src={imageUrl} alt="preview" className="max-h-52 rounded-lg border" />}
            <button onClick={clearMedia} className="absolute top-1 left-1 bg-black/60 text-white rounded-full p-1" aria-label="הסר מדיה"><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <label className="inline-flex items-center gap-2 cursor-pointer border border-dashed border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-600 hover:bg-slate-50">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'מעלה…' : 'העלה תמונה או סרטון של הפוסט'}
            <input type="file" accept="image/*,video/*" onChange={onFile} disabled={uploading} className="hidden" />
          </label>
        )}

        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-slate-400 shrink-0" />
          <Input value={link} onChange={(e) => setLink(e.target.value)} dir="ltr"
            placeholder="קישור לפוסט/סרטון (אופציונלי)" className="text-sm" />
        </div>
        <p className="text-[11px] text-slate-400 -mt-1">טיפ: כדי שה-AI ינתח סרטון בפועל — העלה את קובץ הווידאו (עד ~20 שניות). קישור לבד משמש כהקשר בלבד, כי ה-AI לא יכול לצפות בו ישירות.</p>

        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="הדבק כאן את הכיתוב (אופציונלי אם העלית מדיה)…" />
        <Button onClick={review} disabled={loading || uploading || (!text.trim() && !imageUrl && !link.trim())} className="bg-[#A04A2E] hover:bg-[#7A3722]">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'בחן את התוכן'}
        </Button>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </Card>

      {res && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className={`text-4xl font-bold ${scoreColor(res.score)}`}>{res.score}<span className="text-lg text-slate-400">/10</span></div>
            <div className="text-sm text-slate-800 font-medium">{res.verdict}</div>
          </div>
          {res.issues?.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-red-700 mb-1">⚠️ מה לא טוב וצריך לשפר</div>
              <ul className="text-sm text-slate-700 list-disc pr-5 space-y-1">{res.issues.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
          {res.strengths?.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-emerald-700 mb-1">✅ מה חזק</div>
              <ul className="text-sm text-slate-700 list-disc pr-5 space-y-0.5">{res.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
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
