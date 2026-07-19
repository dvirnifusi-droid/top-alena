import React, { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Save, ChevronDown, Upload, Trash2, CheckCircle2 } from 'lucide-react';

const MAX_MB = 45; // server body limit is 50MB; leave room for the encoding overhead

// Owner controls for the page the customer lands on after the bot.
export default function ThanksPageSettings() {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [px, setPx] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [denied, setDenied] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        base44.functions.getEventThanksSettings({}),
        base44.functions.getMarketingPixels({}),
      ]);
      setCfg((a?.data ?? a) || {});
      setPx((b?.data ?? b) || {});
    } catch (e) {
      if (/forbidden|unauthorized|admin only|401|403/i.test(String(e?.message))) setDenied(true);
    }
  }, []);
  useEffect(() => { if (open && !cfg) load(); }, [open, cfg, load]);

  const onVideo = async (file) => {
    if (!file) return;
    if (!/^video\//.test(file.type)) { setMsg({ ok: false, t: 'זה לא קובץ וידאו' }); return; }
    const mb = file.size / 1024 / 1024;
    if (mb > MAX_MB) {
      setMsg({ ok: false, t: `הקובץ ${mb.toFixed(0)}MB — המקסימום ${MAX_MB}MB. קצר את הסרטון או ייצא באיכות נמוכה יותר.` });
      return;
    }
    setUploading(true); setMsg(null);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setCfg((c) => ({ ...c, video_url: file_url }));
      setMsg({ ok: true, t: 'הסרטון הועלה — לחץ שמור כדי לפרסם אותו' });
    } catch (e) { setMsg({ ok: false, t: e?.message || 'שגיאה בהעלאה' }); }
    setUploading(false);
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      await base44.functions.setEventThanksSettings({
        video_url: cfg?.video_url || '',
        video_title: cfg?.video_title || '',
        response_text: cfg?.response_text || '',
      });
      await base44.functions.setMarketingPixels({
        meta_pixel_id: px?.meta_pixel_id || '',
        meta_event_name: px?.meta_event_name || 'Lead',
        google_ads_id: px?.google_ads_id || '',
        google_ads_label: px?.google_ads_label || '',
        ga4_id: px?.ga4_id || '',
        enabled: true,
      });
      setMsg({ ok: true, t: 'נשמר · הדף מתעדכן מיד' });
    } catch (e) { setMsg({ ok: false, t: e?.message || 'שגיאה בשמירה' }); }
    setSaving(false);
  };

  if (denied) return null;

  return (
    <Card dir="rtl" className="mb-4 border-indigo-200">
      <CardHeader className="cursor-pointer py-3" onClick={() => setOpen((o) => !o)}>
        <CardTitle className="text-sm flex items-center justify-between">
          <span>⚙️ דף התודה — סרטון, זמן תגובה ופיקסלים</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </CardTitle>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
          {!cfg ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : (
            <>
              <div>
                <label className="text-xs text-slate-500">סרטון שהלקוח יראה</label>
                {cfg.video_url ? (
                  <div className="mt-1 space-y-2">
                    <video src={cfg.video_url} controls className="w-full max-w-sm rounded-lg bg-black" />
                    <Button size="sm" variant="outline"
                      onClick={() => setCfg((c) => ({ ...c, video_url: '' }))}>
                      <Trash2 className="w-4 h-4 ml-1 text-red-500" /> הסר סרטון
                    </Button>
                  </div>
                ) : (
                  <div className="mt-1">
                    <input ref={fileRef} type="file" accept="video/*" className="hidden"
                      onChange={(e) => onVideo(e.target.files?.[0])} />
                    <Button size="sm" variant="outline" disabled={uploading}
                      onClick={() => fileRef.current?.click()}>
                      {uploading ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Upload className="w-4 h-4 ml-1" />}
                      {uploading ? 'מעלה…' : 'העלה סרטון'}
                    </Button>
                    <p className="text-[11px] text-slate-400 mt-1">
                      עד {MAX_MB}MB. סרטון של 30-60 שניות נכנס בנוחות — ארוך מדי נטען לאט בסלולר ורוב הלקוחות לא יראו אותו עד הסוף.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs text-slate-500">כותרת מעל הסרטון (אופציונלי)</label>
                <Input className="mt-1" placeholder="קצת מאיתנו"
                  value={cfg.video_title || ''}
                  onChange={(e) => setCfg((c) => ({ ...c, video_title: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs text-slate-500">מה מבטיחים ללקוח</label>
                <Input className="mt-1" placeholder="נחזור אליך תוך יום עסקים אחד"
                  value={cfg.response_text || ''}
                  onChange={(e) => setCfg((c) => ({ ...c, response_text: e.target.value }))} />
                <p className="text-[11px] text-slate-400 mt-1">
                  אל תבטיח מה שלא תעמוד בו — זה הדבר הראשון שהלקוח בודק.
                </p>
              </div>

              <div className="border-t pt-3">
                <label className="text-xs text-slate-500">Meta Pixel ID</label>
                <Input className="mt-1" dir="ltr" placeholder="1536394804662683"
                  value={px?.meta_pixel_id || ''}
                  onChange={(e) => setPx((p) => ({ ...p, meta_pixel_id: e.target.value }))} />
                <p className="text-[11px] text-slate-400 mt-1">
                  ריק = משתמש בפיקסל שכבר מותקן באתר. מלא רק כדי לדרוס אותו.
                </p>
              </div>

              <details>
                <summary className="text-xs text-slate-500 cursor-pointer">Google Ads / GA4 (לא חובה)</summary>
                <div className="grid sm:grid-cols-2 gap-2 mt-2">
                  <Input dir="ltr" placeholder="AW-123456789" value={px?.google_ads_id || ''}
                    onChange={(e) => setPx((p) => ({ ...p, google_ads_id: e.target.value }))} />
                  <Input dir="ltr" placeholder="conversion label" value={px?.google_ads_label || ''}
                    onChange={(e) => setPx((p) => ({ ...p, google_ads_label: e.target.value }))} />
                  <Input dir="ltr" placeholder="G-XXXXXXX" value={px?.ga4_id || ''}
                    onChange={(e) => setPx((p) => ({ ...p, ga4_id: e.target.value }))} />
                </div>
              </details>

              {msg && (
                <div className={`text-xs flex items-center gap-1 ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>
                  {msg.ok && <CheckCircle2 className="w-3.5 h-3.5" />}{msg.t}
                </div>
              )}

              <Button onClick={save} disabled={saving || uploading} size="sm">
                {saving ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Save className="w-4 h-4 ml-1" />}
                שמור
              </Button>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
