import React from 'react';

// Visual badge showing where a reservation came from.
// Used in dashboards, lists, and detail views. Keep tiny — designed to live
// inline next to the guest name.
//
// Recognized sources:
//   instagram, tiktok, facebook, google, whatsapp, qr, sms, email,
//   direct (no referrer), other (any unknown explicit utm_source)

const SOURCE_META = {
  instagram: { icon: '📷', label: 'Instagram', cls: 'bg-pink-100 text-pink-700 border-pink-200' },
  tiktok:    { icon: '🎵', label: 'TikTok',    cls: 'bg-slate-900 text-white border-slate-900' },
  facebook:  { icon: '📘', label: 'Facebook',  cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  google:    { icon: '🔍', label: 'Google',    cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  whatsapp:  { icon: '💬', label: 'WhatsApp',  cls: 'bg-green-100 text-green-700 border-green-200' },
  qr:        { icon: '📲', label: 'QR',        cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  sms:       { icon: '✉️', label: 'SMS',       cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  email:     { icon: '📧', label: 'Email',     cls: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  direct:    { icon: '🌐', label: 'ישיר',       cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  other:     { icon: '🔗', label: 'אחר',        cls: 'bg-gray-100 text-gray-600 border-gray-200' },
};

export default function ReservationSourceBadge({ source, campaign, compact = false, showCampaign = true }) {
  if (!source) return null;
  const meta = SOURCE_META[source] || { icon: '🔗', label: source, cls: 'bg-gray-100 text-gray-600 border-gray-200' };
  const showLabel = !compact;
  return (
    <span
      title={campaign ? `${meta.label}${campaign ? ` · ${campaign}` : ''}` : meta.label}
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${meta.cls}`}
    >
      <span className="text-[11px] leading-none">{meta.icon}</span>
      {showLabel && <span>{meta.label}</span>}
      {showCampaign && campaign && !compact && (
        <span className="opacity-70 font-normal max-w-[70px] truncate">· {campaign}</span>
      )}
    </span>
  );
}
