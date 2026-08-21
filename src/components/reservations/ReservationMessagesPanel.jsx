import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, MessageSquare, Mail, Phone, RefreshCw } from 'lucide-react';

// The full message history for one reservation: every SMS, WhatsApp and email
// the system sent this guest, with delivery status. Reads getReservationMessages,
// which returns [] for a booking made before logging existed — so an empty list
// means "nothing recorded", shown honestly rather than as "no messages sent".
const CHANNEL = {
  whatsapp: { icon: MessageSquare, label: 'וואטסאפ', color: '#25617a' },
  sms: { icon: Phone, label: 'SMS', color: '#7C5626' },
  email: { icon: Mail, label: 'מייל', color: '#5F8B3D' },
};
const KIND_HE = {
  confirmation: 'אישור הזמנה',
  standby: 'רשימת המתנה',
  deposit_request: 'בקשת פיקדון',
  ticket_request: 'בקשת תשלום',
  reminder: 'תזכורת',
  reconfirm: 'אישור מחדש',
};
const STATUS = {
  sent: { t: 'נשלח', bg: '#EFE7D6', fg: '#8A755A' },
  delivered: { t: 'נמסר ✓', bg: '#DDEFD0', fg: '#2F5417' },
  read: { t: 'נקרא ✓✓', bg: '#CFE8F5', fg: '#1C5A76' },
  failed: { t: 'נכשל', bg: '#F7E0DA', fg: '#A8442A' },
  skipped: { t: 'לא נשלח', bg: '#EFE7D6', fg: '#8A755A' },
};

export default function ReservationMessagesPanel({ reservationId }) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = async () => {
    if (!reservationId) return;
    setLoading(true); setErr('');
    try {
      const r = await base44.functions.getReservationMessages({ reservation_id: reservationId });
      const d = r?.data || r;
      setRows(d?.messages || []);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [reservationId]);

  return (
    <div dir="rtl" className="rounded-xl" style={{ background: '#FFFEFB', border: '1px solid #E3D3AC' }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid #F0E6CF' }}>
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4" style={{ color: '#B89556' }} />
          <span className="text-sm font-bold" style={{ color: '#241811' }}>הודעות שנשלחו ללקוח</span>
        </div>
        <button onClick={load} className="p-1 rounded hover:bg-black/5" title="רענון">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} style={{ color: '#8A755A' }} />
        </button>
      </div>

      <div className="p-3">
        {loading && rows === null ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" style={{ color: '#B89556' }} /></div>
        ) : err ? (
          <div className="text-xs text-center py-3" style={{ color: '#A8442A' }}>שגיאה בטעינה: {err}</div>
        ) : !rows || rows.length === 0 ? (
          <div className="text-xs text-center py-3" style={{ color: '#8A755A' }}>
            אין הודעות מתועדות להזמנה זו.
            <div className="mt-0.5 opacity-70">הזמנות שנוצרו לפני הפעלת היומן לא יופיעו כאן.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((m, i) => {
              const ch = CHANNEL[m.channel] || { icon: MessageSquare, label: m.channel || '—', color: '#8A755A' };
              const Ico = ch.icon;
              const st = STATUS[m.status] || { t: m.status || '—', bg: '#EEE', fg: '#555' };
              const when = m.createdAt ? new Date(m.createdAt).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
              return (
                <div key={i} className="rounded-lg p-2.5" style={{ background: '#FAF6EC', border: '1px solid #F0E6CF' }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: ch.color }}>
                      <Ico className="w-3.5 h-3.5" />{ch.label}
                    </span>
                    <span className="text-[11px] font-bold" style={{ color: '#241811' }}>{KIND_HE[m.kind] || m.kind || ''}</span>
                    <span className="text-[11px] rounded px-1.5 py-0.5 font-bold" style={{ background: st.bg, color: st.fg }}>{st.t}</span>
                    <span className="text-[10.5px] tabular-nums mr-auto" style={{ color: '#8A755A' }}>{when}</span>
                  </div>
                  {m.body && (
                    <p className="text-[12px] mt-1.5 whitespace-pre-wrap leading-snug" style={{ color: '#44403A' }}>
                      {m.body.length > 240 ? m.body.slice(0, 240) + '…' : m.body}
                    </p>
                  )}
                  {m.error && <p className="text-[11px] mt-1" style={{ color: '#A8442A' }}>⚠ {m.error}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
