// Story Studio — upload a product photo, the AI writes a punchy overlay + caption,
// and the app composes a ready-to-post Instagram-story image (client-side canvas).
import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { UploadFile } from '@/integrations/Core';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Upload, X, Copy, Check, Download, Sparkles } from 'lucide-react';

const withHash = (tags) => (tags || []).map((h) => (String(h).startsWith('#') ? h : '#' + h)).join(' ');

// Wrap RTL text to a max width, returning the lines.
function wrapLines(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export default function StoryStudio() {
  const [imageUrl, setImageUrl] = useState('');
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [rendered, setRendered] = useState(false);
  const canvasRef = useRef(null);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setErr(''); setRes(null); setRendered(false);
    try {
      const { file_url } = await UploadFile({ file });
      setImageUrl(file_url);
    } catch (er) { setErr('העלאת התמונה נכשלה: ' + (er?.message || '')); }
    finally { setUploading(false); }
  };

  const generate = async () => {
    if (!imageUrl) { setErr('העלה תמונה'); return; }
    setLoading(true); setErr(''); setRes(null); setRendered(false);
    try {
      const r = await base44.functions.generateStoryContent({ image_url: imageUrl, note });
      setRes(r?.data || r || {});
    } catch (e) { setErr(e?.message || 'היצירה נכשלה'); }
    finally { setLoading(false); }
  };

  // Compose the story image whenever a result + image are ready.
  useEffect(() => {
    if (!res || !imageUrl || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = 1080; canvas.height = 1920;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const scale = Math.max(1080 / img.width, 1920 / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.fillStyle = '#1b1512'; ctx.fillRect(0, 0, 1080, 1920);
        ctx.drawImage(img, (1080 - w) / 2, (1920 - h) / 2, w, h);
        const grad = ctx.createLinearGradient(0, 1120, 0, 1920);
        grad.addColorStop(0, 'rgba(26,16,10,0)');
        grad.addColorStop(1, 'rgba(64,29,18,0.94)');
        ctx.fillStyle = grad; ctx.fillRect(0, 1120, 1080, 800);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 88px "Segoe UI", Arial';
        const lines = wrapLines(ctx, res.overlay_text, 960);
        let y = 1640 - (lines.length - 1) * 100;
        for (const ln of lines) { ctx.fillText(ln, 540, y); y += 104; }
        ctx.font = '600 46px "Segoe UI", Arial'; ctx.fillStyle = '#F0D9A0';
        ctx.fillText(res.brand || '', 540, 1810);
        setRendered(true);
      } catch { setRendered(false); }
    };
    img.onerror = () => setRendered(false);
    img.src = imageUrl;
  }, [res, imageUrl]);

  const download = () => {
    try {
      const url = canvasRef.current.toDataURL('image/jpeg', 0.92);
      const a = document.createElement('a');
      a.href = url; a.download = 'story.jpg'; a.click();
    } catch { setErr('ההורדה נכשלה — נסה שוב'); }
  };

  return (
    <div dir="rtl" className="space-y-4 max-w-3xl">
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4 space-y-3">
          <div className="text-sm text-slate-600 flex items-center gap-1"><Sparkles className="w-4 h-4 text-orange-600" /> העלה תמונת מוצר/מנה — ה-AI יכתוב טקסט ויעצב סטורי מוכן לפרסום.</div>
          {imageUrl ? (
            <div className="relative inline-block">
              <img src={imageUrl} alt="preview" className="max-h-52 rounded-lg border" />
              <button onClick={() => { setImageUrl(''); setRes(null); setRendered(false); }} className="absolute top-1 left-1 bg-black/60 text-white rounded-full p-1" aria-label="הסר"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <label className="inline-flex items-center gap-2 cursor-pointer border border-dashed border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-600 hover:bg-slate-50">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'מעלה…' : 'העלה תמונה'}
              <input type="file" accept="image/*" onChange={onFile} disabled={uploading} className="hidden" />
            </label>
          )}
          <div>
            <label className="text-xs text-slate-500">הקשר (אופציונלי) — מנה חדשה / מבצע / חג</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="למשל: מבצע חמישי, קוקטייל חדש…" className="mt-1" />
          </div>
          <Button onClick={generate} disabled={loading || uploading || !imageUrl} className="bg-[#A04A2E] hover:bg-[#7A3722] w-full">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '✨ צור סטורי'}
          </Button>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </Card>

        <Card className="p-4 flex flex-col items-center justify-center gap-3">
          <div className="text-xs text-slate-500 self-start">תצוגה מקדימה (סטורי 1080×1920)</div>
          <canvas ref={canvasRef} className={`w-[200px] rounded-lg border ${rendered ? '' : 'hidden'}`} style={{ aspectRatio: '9/16' }} />
          {!rendered && <div className="w-[200px] aspect-[9/16] rounded-lg border border-dashed flex items-center justify-center text-xs text-slate-400 text-center p-4">כאן יופיע הסטורי המעוצב אחרי היצירה</div>}
          {rendered && (
            <Button onClick={download} variant="outline" className="w-full"><Download className="w-4 h-4 ml-1" /> הורד לסטורי</Button>
          )}
        </Card>
      </div>

      {res && (res.caption || res.hashtags?.length > 0) && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-[#44512C]">📝 הכיתוב לפוסט</div>
            <Button size="sm" variant="outline" onClick={() => {
              try { navigator.clipboard?.writeText([res.caption, res.cta, withHash(res.hashtags)].filter(Boolean).join('\n\n')); } catch { /* ignore */ }
              setCopied(true); setTimeout(() => setCopied(false), 1500);
            }}>{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} העתק</Button>
          </div>
          <div className="bg-slate-50 border rounded-lg p-3 text-sm whitespace-pre-wrap">{res.caption}</div>
          {res.cta && <div className="text-sm text-slate-700">👉 {res.cta}</div>}
          {res.hashtags?.length > 0 && <div className="text-xs text-blue-600">{withHash(res.hashtags)}</div>}
        </Card>
      )}
    </div>
  );
}
