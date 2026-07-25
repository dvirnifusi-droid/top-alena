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
  const [building, setBuilding] = useState(false);
  const [campaign, setCampaign] = useState(null);
  const [error, setError] = useState('');
  const [chosenCopy, setChosenCopy] = useState(0);
  const [confirmSend, setConfirmSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

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
      const res = await base44.functions.getDriveImages({});
      setDrive((res?.data || res) || { images: [], folders: [] });
    } catch (err) { setError('לא הצלחתי לטעון את הדרייב — ודא שחיברת תיקיית Drive באינטגרציות.'); }
    finally { setDriveLoading(false); }
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
              placeholder='מה שה-AI יסדר בתמונה? למשל: "הבלט את המנה, רקע נקי ואלגנטי, הוסף פס אדום עם המחיר 59₪, תאורה חמה"'
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white resize-none" />
          </div>
        )}

        {/* As-is upload mode. */}
        {imageMode === 'upload' && (
          <div className="mb-3"><PhotoPicker /></div>
        )}

        {imageUrl && <img src={imageUrl} alt="" className="h-24 rounded-xl object-cover mb-3 border" />}

        {driveOpen && (
          <div className="mb-3 border border-slate-200 rounded-xl p-2 max-h-44 overflow-y-auto">
            {driveLoading ? <div className="text-center py-3"><Loader2 className="w-5 h-5 animate-spin text-amber-500 mx-auto" /></div> : (
              <div className="grid grid-cols-4 gap-2">
                {(drive?.images || []).map(im => (
                  <button key={im.id} onClick={() => pickDrive(im.id)} title={im.name} className="rounded-lg overflow-hidden border hover:border-amber-400">
                    <img src={im.thumbnailLink} alt={im.name} className="w-full h-16 object-cover" />
                  </button>
                ))}
                {!(drive?.images || []).length && <div className="col-span-4 text-xs text-slate-400 text-center py-3">אין תמונות בתיקייה.</div>}
              </div>
            )}
          </div>
        )}

        <button onClick={build} disabled={building || !goal.trim() || aiNeedsMore}
          className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-bold px-5 py-2.5 rounded-xl disabled:opacity-60 w-full sm:w-auto">
          {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {building ? 'בונה קמפיין…' : (imageMode === 'ai' ? 'עצב ובנה קמפיין' : 'בנה קמפיין')}
        </button>
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {error}</div>}

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
