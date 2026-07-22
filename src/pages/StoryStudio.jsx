// Content Studio — upload a product photo, the AI writes a punchy overlay +
// caption, and the app composes a ready-to-post image (story OR feed sizes),
// client-side canvas. Optional AI retouch polishes the real dish.
import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { UploadFile } from '@/integrations/Core';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Upload, X, Copy, Check, Download, Sparkles, Wand2, RotateCcw, Camera, Film } from 'lucide-react';

const withHash = (tags) => (tags || []).map((h) => (String(h).startsWith('#') ? h : '#' + h)).join(' ');

// Output formats — the owner wanted "not just story". Instagram-friendly sizes.
const FORMATS = [
  { key: 'story', label: 'סטורי', sub: '9:16', w: 1080, h: 1920 },
  { key: 'portrait', label: 'פוסט לאורך', sub: '4:5', w: 1080, h: 1350 },
  { key: 'square', label: 'פוסט מרובע', sub: '1:1', w: 1080, h: 1080 },
];

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
  const [enhancedUrl, setEnhancedUrl] = useState(''); // AI-retouched version (data URL)
  const [enhancing, setEnhancing] = useState(false);
  const [note, setNote] = useState('');
  const [formatKey, setFormatKey] = useState('story');
  const [usage, setUsage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [videoSrc, setVideoSrc] = useState(''); // local object URL while picking a frame
  const canvasRef = useRef(null);
  const videoRef = useRef(null);

  const fmt = FORMATS.find((f) => f.key === formatKey) || FORMATS[0];
  // What the design is built on: the AI-retouched photo if asked for, else the upload.
  const sourceUrl = enhancedUrl || imageUrl;

  const loadUsage = async () => {
    try { const r = await base44.functions.getStoryStudioUsage(); setUsage(r?.data || r || null); }
    catch { setUsage(null); }
  };
  useEffect(() => { loadUsage(); }, []);

  const clearVideo = () => { if (videoSrc) { try { URL.revokeObjectURL(videoSrc); } catch { /* ignore */ } setVideoSrc(''); } };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(''); setRes(null); setRendered(false); setEnhancedUrl(''); setImageUrl('');
    // Video → scrub locally and grab a frame. The clip itself never uploads;
    // only the captured still does, so this stays cheap.
    if ((file.type || '').startsWith('video/')) {
      clearVideo();
      setVideoSrc(URL.createObjectURL(file));
      return;
    }
    setUploading(true);
    try {
      const { file_url } = await UploadFile({ file });
      setImageUrl(file_url);
    } catch (er) { setErr('העלאת התמונה נכשלה: ' + (er?.message || '')); }
    finally { setUploading(false); }
  };

  // Grab the frame currently shown in the video, upload it as a JPEG, and treat
  // it exactly like an uploaded photo from here on.
  const captureFrame = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) { setErr('הסרטון עוד נטען — נסה שוב בעוד רגע'); return; }
    setUploading(true); setErr('');
    try {
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.95));
      if (!blob) throw new Error('לכידה נכשלה');
      const file = new File([blob], 'frame.jpg', { type: 'image/jpeg' });
      const { file_url } = await UploadFile({ file });
      setImageUrl(file_url);
      clearVideo();
    } catch (er) { setErr('לכידת הפריים נכשלה: ' + (er?.message || '')); }
    finally { setUploading(false); }
  };

  // Opt-in AI retouch — polishes the REAL dish (light/colour/background), keeps
  // the food authentic. Costs a little per click, so it's a deliberate button.
  const enhance = async () => {
    if (!imageUrl) return;
    setEnhancing(true); setErr(''); setRendered(false);
    try {
      const r = await base44.functions.enhanceStoryPhoto({ image_url: imageUrl, note });
      const d = r?.data || r || {};
      if (!d.image_data_url) throw new Error('שדרוג ה-AI לא הוחזר — נסה שוב');
      setEnhancedUrl(d.image_data_url);
      loadUsage();
    } catch (e) { setErr(e?.message || 'שדרוג ה-AI נכשל'); }
    finally { setEnhancing(false); }
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

  // Compose the image whenever a result + photo are ready. Format-aware: the
  // text and accents are positioned relative to the chosen canvas height.
  useEffect(() => {
    if (!res || !sourceUrl || !canvasRef.current) return;
    const { w: W, h: H } = fmt;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = W; canvas.height = H;

    const paint = () => {
      const img = new Image();
      if (!enhancedUrl) img.crossOrigin = 'anonymous'; // data: URLs never taint
      img.onload = () => {
        try {
          // Cover-fit with a gentle authentic lift (colour/contrast/brightness).
          const scale = Math.max(W / img.width, H / img.height);
          const w = img.width * scale, h = img.height * scale;
          ctx.fillStyle = '#160f0b'; ctx.fillRect(0, 0, W, H);
          ctx.save();
          ctx.filter = 'saturate(1.14) contrast(1.07) brightness(1.03)';
          ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
          ctx.restore();

          // Bottom gradient scrim for legibility.
          const gTop = Math.round(H * 0.48);
          const grad = ctx.createLinearGradient(0, gTop, 0, H);
          grad.addColorStop(0, 'rgba(18,10,6,0)');
          grad.addColorStop(0.55, 'rgba(30,15,9,0.72)');
          grad.addColorStop(1, 'rgba(40,18,10,0.97)');
          ctx.fillStyle = grad; ctx.fillRect(0, gTop, W, H - gTop);

          ctx.textAlign = 'center';
          const cx = W / 2;
          // Overlay headline — display serif, wrapped, with a soft shadow.
          ctx.font = '900 96px "Frank Ruhl Libre", Georgia, serif';
          const lines = wrapLines(ctx, res.overlay_text, W - 160);
          const lineH = 112;
          const brandY = H - Math.round(H * 0.052);
          let y = brandY - Math.round(H * 0.055) - (lines.length - 1) * lineH;

          // Brand accent bar above the headline.
          ctx.fillStyle = '#E4A24E';
          ctx.fillRect(cx - 64, y - 118, 128, 9);

          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 4;
          ctx.fillStyle = '#ffffff';
          for (const ln of lines) { ctx.fillText(ln, cx, y); y += lineH; }
          ctx.restore();

          // Brand name — the app's sans.
          ctx.font = '700 46px "Assistant", system-ui, sans-serif';
          ctx.fillStyle = '#F0D9A0';
          ctx.fillText(res.brand || '', cx, brandY);
          setRendered(true);
        } catch { setRendered(false); }
      };
      img.onerror = () => setRendered(false);
      img.src = sourceUrl;
    };

    // Make sure the display fonts are loaded before painting, else canvas falls
    // back to a system face and the "cool font" is lost.
    const fonts = (typeof document !== 'undefined' && document.fonts) ? document.fonts : null;
    if (fonts?.load) {
      Promise.all([
        fonts.load('900 96px "Frank Ruhl Libre"'),
        fonts.load('700 46px "Assistant"'),
      ]).then(paint).catch(paint);
    } else { paint(); }
  }, [res, sourceUrl, enhancedUrl, formatKey]);

  const download = () => {
    try {
      const url = canvasRef.current.toDataURL('image/jpeg', 0.92);
      const a = document.createElement('a');
      a.href = url; a.download = `${fmt.key}.jpg`; a.click();
    } catch { setErr('ההורדה נכשלה — נסה שוב'); }
  };

  return (
    <div dir="rtl" className="space-y-4 max-w-3xl">
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4 space-y-3">
          <div className="text-sm text-slate-600 flex items-center gap-1"><Sparkles className="w-4 h-4 text-orange-600" /> העלה תמונת מוצר/מנה — ה-AI יכתוב טקסט ויעצב לך תוכן מוכן לפרסום.</div>

          {/* Output format */}
          <div>
            <label className="text-xs text-slate-500">פורמט</label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {FORMATS.map((f) => (
                <button key={f.key} type="button" onClick={() => { setFormatKey(f.key); setRendered(false); }}
                  className={`px-3 py-1.5 rounded-lg border text-sm ${formatKey === f.key ? 'border-[#A04A2E] bg-orange-50 text-[#A04A2E] font-semibold' : 'border-slate-200 text-slate-600'}`}>
                  {f.label} <span className="text-[10px] text-slate-400">{f.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {imageUrl ? (
            <div className="space-y-2">
              <div className="relative inline-block">
                <img src={sourceUrl} alt="preview" className="max-h-52 rounded-lg border" />
                {enhancedUrl && <span className="absolute bottom-1 right-1 bg-orange-600 text-white text-[10px] px-1.5 py-0.5 rounded">✨ שודרג</span>}
                <button onClick={() => { setImageUrl(''); setEnhancedUrl(''); setRes(null); setRendered(false); }} className="absolute top-1 left-1 bg-black/60 text-white rounded-full p-1" aria-label="הסר"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {!enhancedUrl ? (
                  <Button size="sm" variant="outline" onClick={enhance} disabled={enhancing} className="text-orange-700 border-orange-300">
                    {enhancing ? <><Loader2 className="w-4 h-4 animate-spin ml-1" /> משדרג…</> : <><Wand2 className="w-4 h-4 ml-1" /> שדרג עם AI (סטודיו)</>}
                  </Button>
                ) : (
                  <button onClick={() => { setEnhancedUrl(''); setRendered(false); }} className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> חזור לתמונה המקורית</button>
                )}
              </div>
              {!enhancedUrl && <p className="text-[11px] text-slate-400">משפר תאורה, צבע ורקע — המנה נשארת בדיוק כמו שצילמת. אופציונלי, ~15 אג׳ לתמונה.</p>}
            </div>
          ) : videoSrc ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-600"><Film className="w-4 h-4 text-orange-600" /> עצור את הסרטון על הרגע הכי טוב ולחץ "צלם פריים".</div>
              <video ref={videoRef} src={videoSrc} controls playsInline className="max-h-56 rounded-lg border w-full bg-black" />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={captureFrame} disabled={uploading} className="bg-[#A04A2E] hover:bg-[#7A3722]">
                  {uploading ? <><Loader2 className="w-4 h-4 animate-spin ml-1" /> תופס…</> : <><Camera className="w-4 h-4 ml-1" /> צלם את הפריים הנוכחי</>}
                </Button>
                <button onClick={clearVideo} className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"><X className="w-3.5 h-3.5" /> בטל</button>
              </div>
            </div>
          ) : (
            <label className="inline-flex items-center gap-2 cursor-pointer border border-dashed border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-600 hover:bg-slate-50">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'מעלה…' : 'העלה תמונה או סרטון'}
              <input type="file" accept="image/*,video/*" onChange={onFile} disabled={uploading} className="hidden" />
            </label>
          )}

          {/* AI usage counter */}
          {usage && usage.enhanced_this_month > 0 && (
            <div className="text-[11px] text-slate-500 bg-slate-50 border rounded-lg px-2.5 py-1.5">
              ✨ החודש שודרגו <b>{usage.enhanced_this_month}</b> תמונות עם AI · עלות משוערת ≈ ₪{usage.est_cost_ils}
            </div>
          )}

          <div>
            <label className="text-xs text-slate-500">הקשר (אופציונלי) — מנה חדשה / מבצע / חג</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="למשל: מבצע חמישי, קוקטייל חדש…" className="mt-1" />
          </div>
          <Button onClick={generate} disabled={loading || uploading || enhancing || !imageUrl} className="bg-[#A04A2E] hover:bg-[#7A3722] w-full">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '✨ צור עיצוב'}
          </Button>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </Card>

        <Card className="p-4 flex flex-col items-center justify-center gap-3">
          <div className="text-xs text-slate-500 self-start">תצוגה מקדימה ({fmt.label} {fmt.w}×{fmt.h})</div>
          <canvas ref={canvasRef} className={`w-[200px] rounded-lg border ${rendered ? '' : 'hidden'}`} style={{ aspectRatio: `${fmt.w}/${fmt.h}` }} />
          {!rendered && <div className="w-[200px] rounded-lg border border-dashed flex items-center justify-center text-xs text-slate-400 text-center p-4" style={{ aspectRatio: `${fmt.w}/${fmt.h}` }}>כאן יופיע העיצוב המוכן אחרי היצירה</div>}
          {rendered && (
            <Button onClick={download} variant="outline" className="w-full"><Download className="w-4 h-4 ml-1" /> הורד ({fmt.label})</Button>
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
