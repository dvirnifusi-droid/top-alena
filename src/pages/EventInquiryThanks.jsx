import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Calendar, Clock, Users, Wallet, PartyPopper, Phone, MessageCircle, CheckCircle, MapPin } from 'lucide-react';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { setPixelId, initMetaPixel, trackLead } from '@/lib/metaPixel';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';

const heDate = (v) => {
  if (!v) return null;
  try { return format(parseISO(String(v)), 'd בMMMM yyyy', { locale: he }); }
  catch { return String(v); }   // free-text answers like "סוף אוגוסט" pass through
};

// Where the events bot sends the customer once it has their details.
// Reached as /EventInquiryThanks?token=<unguessable>. Public — the visitor is a
// stranger — so the server hands back only what this one person told the bot.
//
// This landing is also the campaign conversion: the ad platforms are told a lead
// happened HERE, on an act the customer performed, rather than on a score the
// model gave its own conversation.
export default function EventInquiryThanks() {
  const [search] = useSearchParams();
  const token = search.get('token') || '';
  const [lead, setLead] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const branding = useTenantBranding();
  const brandName = branding?.name || 'המסעדה';
  const fired = useRef(false);

  useEffect(() => {
    if (!token) { setError('קישור לא תקין'); setLoading(false); return; }
    (async () => {
      try {
        const res = await base44.asServiceRole.functions.getEventLeadByToken({ token });
        setLead(res?.data || res);
        base44.asServiceRole.functions.getEventThanksSettings({})
          .then((r) => setCfg(r?.data || r)).catch(() => {});
      } catch (e) {
        setError(e?.message === 'not_found' ? 'הפנייה לא נמצאה' : 'שגיאה בטעינת הפרטים');
      } finally { setLoading(false); }
    })();
  }, [token]);

  // Fire only after the summary actually loaded, and only once. A pixel that
  // fires on a broken link reports leads that never existed, which is worse
  // than reporting none — the campaign optimises toward the wrong audience.
  useEffect(() => {
    if (!lead || fired.current) return;
    fired.current = true;
    (async () => {
      try {
        let p = {};
        try {
          const res = await base44.asServiceRole.functions.getMarketingPixels({});
          p = (res?.data || res) || {};
        } catch { /* no settings row yet — fall through to the build-time pixel */ }
        if (p.enabled === false) return;

        // A configured id wins; otherwise the app's existing build-time pixel is
        // used, so this page reports conversions from the moment it ships
        // without anyone having to set anything up first.
        setPixelId(p.meta_pixel_id);
        initMetaPixel();
        trackLead({ content_name: 'Event inquiry', content_category: lead.event_type || undefined });

        if (p.google_ads_id) loadGoogleAds(p.google_ads_id, p.google_ads_label);
        if (p.ga4_id) loadGa4(p.ga4_id);
      } catch { /* a pixel must never break the customer's page */ }
    })();
  }, [lead]);

  if (loading) {
    return (
      <Shell brandName={brandName}>
        <div className="animate-pulse space-y-3">
          <div className="h-6 bg-slate-200 rounded w-2/3 mx-auto" />
          <div className="h-4 bg-slate-100 rounded w-1/2 mx-auto" />
        </div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell brandName={brandName}>
        <p className="text-center text-slate-600">{error}</p>
        <p className="text-center text-xs text-slate-400 mt-2">
          אם הגעת לכאן בטעות, אפשר פשוט לחזור אלינו בטלפון.
        </p>
      </Shell>
    );
  }

  const rows = [
    ['סוג האירוע', lead.event_type, PartyPopper],
    ['תאריך', heDate(lead.event_date), Calendar],
    ['שעה', lead.event_time, Clock],
    ['מספר אורחים', lead.guest_count ? `${lead.guest_count} אורחים` : null, Users],
    ['תקציב לאדם', lead.budget_per_person ? `₪${lead.budget_per_person}` : null, Wallet],
    ['שעות', lead.hours_window, Clock],
    ['מיקום', lead.location, MapPin],
  ].filter(([, v]) => v);

  return (
    <Shell brandName={brandName}>
      <div className="text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
          <CheckCircle className="w-8 h-8 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800">
          {lead.contact_name ? `תודה, ${lead.contact_name}!` : 'תודה!'}
        </h1>
        <p className="text-slate-600 mt-1.5">
          קיבלנו את הפרטים ואנחנו כבר עובדים על הצעה מותאמת עבורך.
        </p>
        <p className="text-sm text-emerald-700 font-medium mt-2">
          {cfg?.response_text || 'נחזור אליך תוך יום עסקים אחד'}
        </p>
      </div>

      <StatusTracker stage={lead.stage || 1} />

      {cfg?.video_url && (
        <div className="mt-5">
          {cfg.video_title && (
            <h2 className="text-sm font-semibold text-slate-700 mb-2">{cfg.video_title}</h2>
          )}
          <video
            src={cfg.video_url}
            controls
            playsInline
            preload="metadata"
            className="w-full rounded-xl bg-black"
          />
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-6 rounded-xl border bg-slate-50/70 overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-white">
            <h2 className="text-sm font-semibold text-slate-700">סיכום הפנייה שלך</h2>
          </div>
          <div className="divide-y">
            {rows.map(([label, value, Icon]) => (
              <div key={label} className="flex items-center gap-3 px-4 py-2.5">
                <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-xs text-slate-500 w-24 shrink-0">{label}</span>
                <span className="text-sm font-medium text-slate-800">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {lead.special_requests && (
        <div className="mt-3 rounded-xl border p-3">
          <p className="text-xs text-slate-500 mb-1">בקשות מיוחדות</p>
          <p className="text-sm text-slate-700">{lead.special_requests}</p>
        </div>
      )}

      {(branding?.phone || branding?.whatsapp) && (
      <div className="mt-6 rounded-xl bg-slate-800 text-white p-4 text-center">
        <p className="text-sm">רוצה להוסיף משהו או לזרז?</p>
        <div className="flex gap-2 justify-center mt-3">
          {branding?.phone && (
            <a href={`tel:${branding.phone}`}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 text-sm transition-colors">
              <Phone className="w-4 h-4" /> חייגו אלינו
            </a>
          )}
          {branding?.whatsapp && (
            <a href={`https://wa.me/${String(branding.whatsapp).replace(/\D/g, '')}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-2 text-sm transition-colors">
              <MessageCircle className="w-4 h-4" /> וואטסאפ
            </a>
          )}
        </div>
      </div>
      )}

      <p className="text-center text-[11px] text-slate-400 mt-5">
        שמרו את הקישור הזה — הוא מרכז את פרטי הפנייה שלכם.
      </p>
    </Shell>
  );
}

// Where the request stands. The same row the manager works on the leads board,
// so marking "התקשרתי" there moves this here — no syncing, one record.
function StatusTracker({ stage }) {
  const steps = ['הפנייה התקבלה', 'דיברנו איתך', 'הצעת מחיר נשלחה', 'סגור — נתראה!'];
  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-slate-700 mb-3">סטטוס הפנייה</h2>
      <div className="flex items-start">
        {steps.map((label, i) => {
          const n = i + 1;
          const done = n <= stage;
          const current = n === stage;
          return (
            <React.Fragment key={label}>
              <div className="flex flex-col items-center flex-1 min-w-0">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                  done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'
                } ${current ? 'ring-4 ring-emerald-100' : ''}`}>
                  {done ? '✓' : n}
                </div>
                <span className={`text-[10px] mt-1.5 text-center leading-tight ${
                  done ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
                  {label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={`h-0.5 flex-1 mt-3.5 ${n < stage ? 'bg-emerald-600' : 'bg-slate-200'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function Shell({ brandName, children }) {
  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-50 to-white py-8 px-4">
      <div className="max-w-lg mx-auto">
        <p className="text-center text-sm text-slate-500 mb-4">{brandName} · אירועים פרטיים</p>
        <div className="bg-white rounded-2xl shadow-sm border p-6">{children}</div>
      </div>
    </div>
  );
}

// ── Google pixel loaders ───────────────────────────────────────────────────
// Meta goes through the app's shared lib; Google has no equivalent yet.
// Injected only after a real summary rendered, and guarded so a blocked or
// ad-blocked script cannot take the page down with it.

function loadGoogleAds(adsId, label) {
  try {
    ensureGtag(adsId);
    window.gtag('config', adsId);
    if (label) window.gtag('event', 'conversion', { send_to: `${adsId}/${label}` });
  } catch { /* ignore */ }
}

function loadGa4(measurementId) {
  try {
    ensureGtag(measurementId);
    window.gtag('config', measurementId);
    window.gtag('event', 'generate_lead');
  } catch { /* ignore */ }
}

function ensureGtag(id) {
  if (!window.gtag) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(s);
  }
}
