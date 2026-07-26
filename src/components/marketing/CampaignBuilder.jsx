import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Loader2, Sparkles, Upload, HardDrive, Wand2, Users2, Coins, Send, Check, AlertTriangle, Megaphone, Target, Image as ImageIcon } from 'lucide-react';

// The unified campaign builder: one goal (+ your OWN photo, optionally designed by
// AI on top of it) → a full campaign (creative + copy variants + a real target
// segment with its count + audience + channel + budget) in one place, then launch
// through the consent-enforced path. The AI never invents a fake dish — it designs
// on the owner's real photo (editImage), which is what keeps creatives on-brand.
export default function CampaignBuilder() {
  const [goal, setGoal] = useState('');
  const [imageUrl, setImageUrl] = useState('');        // uploaded / Drive-hosted base photo
  const [imageMode, setImageMode] = useState('ai');    // 'ai' (design on my photo) | 'upload' (as-is) | 'drive' (as-is)
  const [designInstruction, setDesignInstruction] = useState('');
  const [uploading, setUploading] = useState(false);
  const [drive, setDrive] = useState(null);            // { images, folders } or null
  const [driveOpen, setDriveOpen] = useState(false);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveFolderUrl, setDriveFolderUrl] = useState('');  // pasted Drive folder link
  const [driveSaEmail, setDriveSaEmail] = useState('');       // service-account email to share with
  const [building, setBuilding] = useState(false);
  const [campaign, setCampaign] = useState(null);
  const [error, setError] = useState('');
  const [chosenCopy, setChosenCopy] = useState(0);
  const [confirmSend, setConfirmSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  // Full auto-campaign (photo → design → copy → audience → paused Meta campaign)
  const [audienceMode, setAudienceMode] = useState('lookalike');
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoResult, setAutoResult] = useState(null);
  const [activating, setActivating] = useState(false);
  const [liveMsg, setLiveMsg] = useState('');

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError('');
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      const url = res?.file_url || res?.url || res?.data?.file_url;
      if (url) { setImageUrl(url); setDriveOpen(false); }
    } catch (err) { setError('העלאת התמונה נכשלה: ' + (err?.message || '')); }
    finally { setUploading(false); }
  };

  const loadDrive = async () => {
    setDriveOpen(true); setDriveLoading(true); setError('');
    try {
      const res = await base44.functions.getDriveImages({ folder_url: driveFolderUrl || undefined });
      const d = (res?.data || res) || { images: [], folders: [] };
      setDrive(d);
      if (d.folder_id && !driveFolderUrl) setDriveFolderUrl(`https://drive.google.com/drive/folders/${d.folder_id}`);
    } catch (err) { setError('לא הצלחתי לטעון את הדרייב — ודא ששיתפת את התיקייה עם חשבון השירות (המייל למטה).'); }
    finally { setDriveLoading(false); }
    if (!driveSaEmail) {
      try { const r = await base44.functions.getDriveServiceAccountEmail({}); const e = (r?.data || r)?.client_email; if (e) setDriveSaEmail(e); } catch { /* optional hint */ }
    }
  };

  const pickDrive = async (fileId) => {
    setDriveLoading(true);
    try {
      const res = await base44.functions.getDriveImageUrl({ file_id: fileId });
      const url = (res?.data || res)?.url || (res?.data || res)?.file_url;
      if (url) { setImageUrl(url); setDriveOpen(false); setDrive(null); }
    } catch (err) { setError('בחירת התמונה נכשלה.'); }
    finally { setDriveLoading(false); }
  };

  const aiNeedsMore = imageMode === 'ai' && (!imageUrl || !designInstruction.trim());

  const build = async () => {
    if (imageMode === 'ai' && !imageUrl) { setError('בחר קודם תמונת בסיס (העלאה או מהדרייב) — ה-AI מעצב על תמונה אמיתית שלך.'); return; }
    if (imageMode === 'ai' && !designInstruction.trim()) { setError('כתוב מה שה-AI יסדר בתמונה (למשל: "הבלט את המנה, רקע נקי, הוסף פס אדום עם המחיר").'); return; }
    setBuilding(true); setError(''); setCampaign(null); setSendResult(null); setConfirmSend(false);
    try {
      const res = await base44.functions.buildCampaign({
        goal,
        image_url: imageUrl || undefined,
        design_instruction: imageMode === 'ai' ? designInstruction.trim() : undefined,
      });
      setCampaign((res?.data || res) || null);
      setChosenCopy(0);
    } catch (err) { setError(err?.message || 'בניית הקמפיין נכשלה'); }
    finally { setBuilding(false); }
  };

  const runAuto = async () => {
    if (!goal.trim()) { setError('כתוב מטרה לקמפיין.'); return; }
    if (!imageUrl) { setError('בחר תמונת בסיס (העלאה או מהדרייב) — ה-AI מעצב על תמונה אמיתית שלך.'); return; }
    setAutoRunning(true); setError(''); setAutoResult(null); setLiveMsg(''); setCampaign(null);
    try {
      const res = await base44.functions.createAutoCampaign({
        goal,
        image_url: imageUrl,
        design_instruction: imageMode === 'ai' ? designInstruction.trim() : undefined,
        audience_mode: audienceMode,
      });
      setAutoResult((res?.data || res) || null);
    } catch (err) { setError(err?.message || 'בניית הקמפיין האוטומטי נכשלה'); }
    finally { setAutoRunning(false); }
  };

  const goLive = async () => {
    const bid = autoResult?.campaign?.brief_id;
    if (!bid) return;
    setActivating(true); setLiveMsg('');
    try {
      const res = await base44.functions.activateCampaignBrief({ id: bid });
      const d = res?.data || res;
      setLiveMsg(d?.ok ? (d.message || 'הועלה לאוויר!') : (d?.error || 'ההעלאה נכשלה'));
    } catch (e) { setLiveMsg(e?.message || 'ההעלאה נכשלה'); }
    finally { setActivating(false); }
  };

  const launchClub = async () => {
    const t = campaign?.targeting; const v = campaign?.copy_variants?.[chosenCopy];
    if (!t || !v) return;
    setSending(true); setError('');
    try {
      const msg = [v.hook, v.body].filter(Boolean).join('\n');
      const res = await base44.functions.sendSegmentBlast({ segment_key: t.segment_key, channel: t.channel === 'sms' ? 'sms' : 'whatsapp', message: msg });
      setSendResult((res?.data || res) || {});
    } catch (err) { setSendResult({ error: err?.message || 'שליחה נכשלה' }); }
    finally { setSending(false); setConfirmSend(false); }
  };

  const t = campaign?.targeting;
  const creativeSrc = campaign?.creative?.image_base64
    ? `data:image/png;base64,${campaign.creative.image_base64}`
    : (campaign?.creative?.image_url || imageUrl || '');
  const isClub = t && ['whatsapp', 'sms'].includes(t.channel);

  // A base-photo picker (upload + Drive) reused inside every mode that needs a photo.
  const PhotoPicker = () => (
    <div className="flex flex-wrap items-center gap-2">
      <label className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-xl px-3 py-2 border border-dashed border-slate-300 bg-white text-slate-600 cursor-pointer">
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} העלה תמונה
        <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
      </label>
      <button type="button" onClick={loadDrive}
        className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-xl px-3 py-2 border border-slate-300 bg-white text-slate-600">
        <HardDrive className="w-4 h-4" /> מהדרייב
      </button>
      {imageUrl && <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold"><Check className="w-3.5 h-3.5" /> תמונת בסיס נבחרה</span>}
    </div>
  );

  return (
    <div className="space-y-4" dir="rtl">
      <div className="bg-gradient-to-l from-amber-50 to-white border border-amber-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Wand2 className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-slate-800">🎬 בנה קמפיין שלם</h3>
        </div>
        <p className="text-sm text-slate-500 mb-3">מטרה + תמונה שלך → קריאייטיב מעוצב, קופי, וטירגוט — במקום אחד. ה-AI מעצב על תמונה אמיתית שלך, לא ממציא תמונה.</p>

        <input value={goal} onChange={(e) => setGoal(e.target.value)}
          placeholder='מה רוצים לקדם? למשל: "לדחוף את הסיגר בשר בסופ"ש", "למלא יום שלישי"'
          className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm mb-3" />

        <div className="flex flex-wrap gap-2 mb-3">
          {[
            { k: 'ai', label: 'שה-AI יעצב', icon: Wand2 },
            { k: 'upload', label: 'התמונה שלי כמו שהיא', icon: ImageIcon },
            { k: 'drive', label: 'מהדרייב', icon: HardDrive },
          ].map(o => {
            const OI = o.icon;
            return (
              <button key={o.k}
                onClick={() => { setImageMode(o.k); setImageUrl(''); setDriveOpen(false); if (o.k === 'drive') loadDrive(); }}
                className={`inline-flex items-center gap-1.5 text-sm font-semibold rounded-xl px-3 py-2 border ${imageMode === o.k ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-300'}`}>
                <OI className="w-4 h-4" /> {o.label}
              </button>
            );
          })}
        </div>

        {/* AI-design mode: real base photo + an instruction of what to arrange on it. */}
        {imageMode === 'ai' && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2.5">
            <p className="text-xs text-amber-800 font-semibold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> ה-AI יעצב <u>על התמונה שלך</u> — לא ימציא תמונה חדשה. בחר תמונת בסיס וכתוב מה לסדר בה.
            </p>
            <PhotoPicker />
            <textarea
              value={designInstruction} onChange={(e) => setDesignInstruction(e.target.value)}
              rows={2}
              placeholder='מה שה-AI יסדר בתמונה? למשל: "הבלט את המנה, רקע נקי ואלגנטי, תאורה חמה, זווית מהחיתוך"'
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white resize-none" />
            <p className="text-[11px] text-slate-400">💡 טקסט ומחיר לא נכתבים על התמונה (יוצא מגובב) — הם באים בקופי בנפרד.</p>
          </div>
        )}

        {/* As-is upload mode. */}
        {imageMode === 'upload' && (
          <div className="mb-3"><PhotoPicker /></div>
        )}

        {imageUrl && <img src={imageUrl} alt="" className="h-24 rounded-xl object-cover mb-3 border" />}

        {driveOpen && (
          <div className="mb-3 space-y-2">
            <div className="flex items-center gap-2">
              <input type="url" dir="ltr" value={driveFolderUrl} onChange={(e) => setDriveFolderUrl(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/…"
                className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <button type="button" onClick={loadDrive} disabled={driveLoading}
                className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold px-3 py-2 rounded-lg disabled:opacity-60 shrink-0">טען</button>
            </div>
            {driveSaEmail && (
              <p className="text-[11px] text-slate-400">📩 שתף את התיקייה עם: <span dir="ltr" className="font-mono text-slate-500">{driveSaEmail}</span> (הרשאת "צופה"), ואז לחץ "טען".</p>
            )}
            <div className="border border-slate-200 rounded-xl p-2 max-h-44 overflow-y-auto">
              {driveLoading ? <div className="text-center py-3"><Loader2 className="w-5 h-5 animate-spin text-amber-500 mx-auto" /></div> : (
              <div className="grid grid-cols-4 gap-2">
                {(drive?.images || []).map(im => (
                  <button key={im.id} onClick={() => pickDrive(im.id)} title={im.name} className="rounded-lg overflow-hidden border hover:border-amber-400">
                    <img src={im.thumbnailLink} alt={im.name} className="w-full h-16 object-cover" />
                  </button>
                ))}
                {!(drive?.images || []).length && <div className="col-span-4 text-xs text-slate-400 text-center py-3">אין תמונות בתיקייה, או שהתיקייה לא שותפה עם חשבון השירות.</div>}
              </div>
            )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={build} disabled={building || autoRunning || !goal.trim() || aiNeedsMore}
            className="inline-flex items-center justify-center gap-2 bg-white border border-amber-300 hover:bg-amber-50 text-amber-700 font-bold px-4 py-2.5 rounded-xl disabled:opacity-60">
            {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {building ? 'בונה…' : 'תצוגה מקדימה (בלי להעלות)'}
          </button>
        </div>

        {/* One-button full auto: design → copy → audience → live (paused) campaign. */}
        <div className="mt-3 pt-3 border-t border-amber-200">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs font-bold text-slate-600">👥 קהל היעד:</span>
            {[
              { k: 'lookalike', label: 'דומה ללקוחות שלי (Lookalike)' },
              { k: 'interest', label: 'לפי תחומי עניין' },
            ].map(o => (
              <button key={o.k} onClick={() => setAudienceMode(o.k)}
                className={`text-xs font-semibold rounded-full px-3 py-1 border ${audienceMode === o.k ? 'bg-fuchsia-600 text-white border-fuchsia-600' : 'bg-white text-slate-600 border-slate-300'}`}>
                {o.label}
              </button>
            ))}
          </div>
          <button onClick={runAuto} disabled={autoRunning || building || !goal.trim() || !imageUrl}
            className="inline-flex items-center justify-center gap-2 bg-gradient-to-l from-fuchsia-600 to-amber-500 hover:opacity-90 text-white font-bold px-5 py-2.5 rounded-xl disabled:opacity-60 w-full sm:w-auto shadow">
            {autoRunning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            {autoRunning ? 'בונה קמפיין מלא…' : '🚀 בנה קמפיין מלא והעלה למטא (מושהה)'}
          </button>
          {!imageUrl && <p className="text-[11px] text-slate-400 mt-1">בחר תמונת בסיס כדי להפעיל.</p>}
        </div>
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {error}</div>}

      {autoResult && (
        <div className="bg-white border-2 border-fuchsia-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-fuchsia-500" />
            <h3 className="font-bold text-slate-800">🚀 קמפיין אוטומטי</h3>
          </div>

          <div className="space-y-1">
            {(autoResult.steps || []).map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                {s.ok ? <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />}
                <div><span className={s.ok ? 'text-slate-700 font-semibold' : 'text-amber-700 font-semibold'}>{s.label}</span>{s.note && <span className="text-xs text-slate-400"> — {s.note}</span>}</div>
              </div>
            ))}
          </div>

          {(autoResult.creative?.image_base64 || autoResult.creative?.image_url) && (
            <img src={autoResult.creative.image_base64 ? `data:image/png;base64,${autoResult.creative.image_base64}` : autoResult.creative.image_url}
              alt="creative" className="w-full max-h-72 object-contain rounded-xl border bg-slate-50" />
          )}

          {(autoResult.copy_variants || []).length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-bold text-slate-500">✍️ קופי</div>
              {autoResult.copy_variants.map((v, i) => (
                <div key={i} className="rounded-xl p-2.5 border border-slate-200 bg-slate-50">
                  {v.hook && <div className="font-bold text-sm text-slate-800">{v.hook}</div>}
                  <div className="text-sm text-slate-700 whitespace-pre-wrap">{v.body}</div>
                  {Array.isArray(v.hashtags) && v.hashtags.length > 0 && <div className="text-amber-600 text-xs mt-1">{v.hashtags.map(h => (String(h).startsWith('#') ? h : '#' + h)).join(' ')}</div>}
                </div>
              ))}
            </div>
          )}

          {autoResult.audience_note && <p className="text-xs text-slate-500">👥 {autoResult.audience_note}</p>}

          {autoResult.campaign?.error ? (
            <div className="text-rose-600 text-sm flex items-start gap-1"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {autoResult.campaign.error}</div>
          ) : autoResult.campaign?.meta_campaign_id ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2">
              <div className="text-sm text-emerald-800 font-semibold flex items-center gap-1"><Check className="w-4 h-4" /> הקמפיין נוצר במטא במצב <u>מושהה</u> — מוכן לעלות לאוויר.</div>
              {autoResult.campaign.message && <div className="text-xs text-slate-500">{autoResult.campaign.message}</div>}
              {liveMsg ? (
                <div className="text-sm text-emerald-700 font-bold flex items-center gap-1"><Check className="w-4 h-4" /> {liveMsg}</div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={goLive} disabled={activating} className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-60">
                    {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} העלה לאוויר עכשיו
                  </button>
                  {autoResult.campaign.meta_url && <a href={autoResult.campaign.meta_url} target="_blank" rel="noreferrer" className="text-xs text-fuchsia-700 underline">פתח ב-Meta Ads Manager</a>}
                </div>
              )}
            </div>
          ) : (
            <div className="text-amber-700 text-sm">{autoResult.error || autoResult.campaign?.message || 'הקמפיין לא נוצר — בדוק את השלבים למעלה.'}</div>
          )}
        </div>
      )}

      {campaign && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
          {creativeSrc && (
            <div>
              <div className="text-xs font-bold text-slate-500 mb-1 flex items-center gap-1.5">
                🎨 קריאייטיב
                {campaign.creative?.designed && <span className="text-[11px] font-normal text-amber-600 inline-flex items-center gap-0.5"><Sparkles className="w-3 h-3" /> עוצב מהתמונה שלך</span>}
              </div>
              <img src={creativeSrc} alt="creative" className="w-full max-h-72 object-contain rounded-xl border bg-slate-50" />
              {campaign.creative?.design_error && <p className="text-xs text-amber-700 mt-1">{campaign.creative.design_error}</p>}
            </div>
          )}

          <div>
            <div className="text-xs font-bold text-slate-500 mb-1">✍️ קופי (בחר גרסה)</div>
            <div className="space-y-2">
              {(campaign.copy_variants || []).map((v, i) => (
                <button key={i} onClick={() => setChosenCopy(i)}
                  className={`block w-full text-right rounded-xl p-3 border ${chosenCopy === i ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                  {v.hook && <div className="font-bold text-sm text-slate-800">{v.hook}</div>}
                  <div className="text-sm text-slate-700 whitespace-pre-wrap">{v.body}</div>
                  {Array.isArray(v.hashtags) && v.hashtags.length > 0 && <div className="text-amber-600 text-xs mt-1">{v.hashtags.map(h => (String(h).startsWith('#') ? h : '#' + h)).join(' ')}</div>}
                </button>
              ))}
            </div>
          </div>

          {t && (
            <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
              <div className="flex items-center gap-2 mb-1"><Target className="w-4 h-4 text-slate-500" /><span className="text-xs font-bold text-slate-600">טירגוט מומלץ</span></div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 bg-white border rounded-full px-2 py-1 font-bold"><Users2 className="w-3.5 h-3.5" /> {t.segment_label}{t.recipient_count != null ? ` · ${t.recipient_count.toLocaleString()}` : ''}</span>
                <span className="uppercase text-slate-400 font-mono">{t.channel}</span>
                {t.daily_budget > 0 && <span className="inline-flex items-center gap-1 text-amber-700"><Coins className="w-3.5 h-3.5" /> ₪{t.daily_budget}/יום</span>}
              </div>
              {t.audience_description && <p className="text-xs text-slate-500 mt-1">קהל לפרסום ממומן: {t.audience_description}</p>}
            </div>
          )}

          {/* Launch */}
          {sendResult ? (
            sendResult.error
              ? <div className="text-rose-600 text-sm flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> {sendResult.error}</div>
              : <div className="text-emerald-700 text-sm flex items-center gap-1 font-semibold"><Check className="w-4 h-4" /> נשלח ל-{t?.segment_label}: {sendResult.sent || 0} הצליחו{sendResult.failed ? `, ${sendResult.failed} נכשלו` : ''}{sendResult.note ? ` — ${sendResult.note}` : ''}</div>
          ) : isClub ? (
            confirmSend ? (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-2 flex-wrap">
                <span className="text-sm text-amber-800 flex-1">לשלוח ל-{t.recipient_count?.toLocaleString()} נמענים ({t.segment_label})?</span>
                <button onClick={launchClub} disabled={sending} className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold px-3 py-1.5 rounded-lg disabled:opacity-60">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} כן, שלח
                </button>
                <button onClick={() => setConfirmSend(false)} className="text-sm text-slate-500 px-2">ביטול</button>
              </div>
            ) : (
              <button onClick={() => setConfirmSend(true)} disabled={!campaign.copy_variants?.length}
                className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50">
                <Send className="w-4 h-4" /> שגר למועדון
              </button>
            )
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <Link to={createPageUrl('MarketingAgentsHub')} className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold px-4 py-2 rounded-xl">
                <Megaphone className="w-4 h-4" /> להעלאה ל-{t?.channel === 'meta_ad' ? 'קמפיין ממומן' : 'רשתות'}
              </Link>
              <span className="text-xs text-slate-400">העתק את הקופי + הורד את התמונה לפרסום. ממומן דורש חיבור Meta.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
