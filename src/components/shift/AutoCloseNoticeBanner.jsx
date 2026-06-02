import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function AutoCloseNoticeBanner() {
    const [notice, setNotice] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await base44.functions.getMyAutoCloseNotice({});
                if (!cancelled && res?.data?.notice) setNotice(res.data.notice);
            } catch {
                /* ignore */
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (!notice) return null;

    const when = notice.shift_end
        ? new Date(notice.shift_end).toLocaleString('he-IL', {
              hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
          })
        : '';

    const dismiss = async () => {
        try { await base44.functions.markAutoCloseNoticeSeen({ shift_id: notice.shift_id }); } catch {}
        setNotice(null);
    };

    return (
        <div className="fixed top-4 inset-x-4 z-50 max-w-md mx-auto bg-orange-50 border border-orange-300 rounded-xl shadow-lg p-4 flex items-start gap-3">
            <span className="text-2xl">🚪</span>
            <div className="flex-1 text-sm text-slate-800">
                <div className="font-bold mb-1">המשמרת שלך נסגרה אוטומטית</div>
                <div>סגרנו לך משמרת ב-{when} כי התרחקת מהעסק. אם זו טעות — דבר עם המנהל.</div>
            </div>
            <button
                onClick={dismiss}
                className="text-slate-500 hover:text-slate-800 text-lg leading-none px-1"
                aria-label="סגור"
            >×</button>
        </div>
    );
}
