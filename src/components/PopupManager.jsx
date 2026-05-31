import React, { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { X, ExternalLink } from 'lucide-react';

const POLL_INTERVAL = 60_000; // check every 60s

export default function PopupManager({ user }) {
  const [queue, setQueue] = useState([]);
  const location = useLocation();

  const fetchPopups = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await base44.functions.getActivePopups({});
      const popups = Array.isArray(res?.data) ? res.data : [];
      // client-side page filter
      const filtered = popups.filter(p => {
        if (p.target_audience === 'page' && p.target_page) {
          return location.pathname === p.target_page || location.pathname.startsWith(p.target_page);
        }
        return true;
      });
      // only add new ones (not already in queue)
      setQueue(prev => {
        const existing = new Set(prev.map(p => p.id));
        const toAdd = filtered.filter(p => !existing.has(p.id));
        return toAdd.length ? [...prev, ...toAdd] : prev;
      });
    } catch (_) {}
  }, [user?.id, location.pathname]);

  useEffect(() => {
    fetchPopups();
    const t = setInterval(fetchPopups, POLL_INTERVAL);
    return () => clearInterval(t);
  }, [fetchPopups]);

  const dismiss = useCallback(async (popup, snoozeMinutes) => {
    setQueue(prev => prev.filter(p => p.id !== popup.id));
    try {
      await base44.functions.dismissPopup({ popup_id: popup.id, snooze_minutes: snoozeMinutes || null });
    } catch (_) {}
  }, []);

  if (!queue.length) return null;

  const current = queue[0];

  return (
    <>
      {/* Modals */}
      {current.display_type === 'modal' && (
        <ModalPopup popup={current} onDismiss={dismiss} />
      )}
      {/* Banners — stack at top */}
      {queue.filter(p => p.display_type === 'banner').map(p => (
        <BannerPopup key={p.id} popup={p} onDismiss={dismiss} />
      ))}
      {/* Toasts — stack bottom-left */}
      <div className="fixed bottom-4 left-4 z-[9998] flex flex-col gap-2 max-w-sm">
        {queue.filter(p => p.display_type === 'toast').map(p => (
          <ToastPopup key={p.id} popup={p} onDismiss={dismiss} />
        ))}
      </div>
    </>
  );
}

function ModalPopup({ popup, onDismiss }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95">
        {popup.image_url && (
          <img src={popup.image_url} alt="" className="w-full h-48 object-cover" />
        )}
        <div className="p-6">
          <div className="flex items-start justify-between mb-3">
            <h2 className="text-xl font-bold text-gray-900">{popup.title}</h2>
            <button onClick={() => onDismiss(popup)} className="text-gray-400 hover:text-gray-600 mr-2">
              <X size={20} />
            </button>
          </div>
          <p className="text-gray-600 whitespace-pre-line mb-5">{popup.content}</p>
          <div className="flex gap-2 flex-wrap">
            {popup.cta_text && popup.cta_url && (
              <a
                href={popup.cta_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
                onClick={() => onDismiss(popup)}
              >
                {popup.cta_text} <ExternalLink size={14} />
              </a>
            )}
            {popup.seen_behavior === 'snooze' && popup.snooze_minutes && (
              <button
                onClick={() => onDismiss(popup, popup.snooze_minutes)}
                className="text-sm text-gray-500 underline px-2"
              >
                תזכיר לי מאוחר יותר
              </button>
            )}
            <button
              onClick={() => onDismiss(popup)}
              className="mr-auto text-sm text-gray-400 hover:text-gray-600 px-2"
            >
              סגור
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BannerPopup({ popup, onDismiss }) {
  return (
    <div className="fixed top-0 inset-x-0 z-[9997] bg-blue-600 text-white px-4 py-3 flex items-center gap-3 shadow-md" dir="rtl">
      {popup.image_url && (
        <img src={popup.image_url} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <span className="font-semibold">{popup.title}</span>
        {popup.content && <span className="mr-2 text-blue-100 text-sm">{popup.content}</span>}
      </div>
      {popup.cta_text && popup.cta_url && (
        <a
          href={popup.cta_url}
          target="_blank"
          rel="noreferrer"
          className="bg-white text-blue-700 px-3 py-1 rounded-full text-sm font-medium hover:bg-blue-50 shrink-0"
          onClick={() => onDismiss(popup)}
        >
          {popup.cta_text}
        </a>
      )}
      {popup.seen_behavior === 'snooze' && popup.snooze_minutes && (
        <button onClick={() => onDismiss(popup, popup.snooze_minutes)} className="text-blue-200 text-xs underline shrink-0">
          דחה
        </button>
      )}
      <button onClick={() => onDismiss(popup)} className="text-blue-200 hover:text-white shrink-0">
        <X size={18} />
      </button>
    </div>
  );
}

function ToastPopup({ popup, onDismiss }) {
  useEffect(() => {
    if (popup.seen_behavior === 'always') {
      const t = setTimeout(() => onDismiss(popup), 6000);
      return () => clearTimeout(t);
    }
  }, [popup, onDismiss]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-4 flex gap-3 animate-in slide-in-from-bottom-4" dir="rtl">
      {popup.image_url && (
        <img src={popup.image_url} alt="" className="h-10 w-10 rounded object-cover shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-gray-900">{popup.title}</p>
        {popup.content && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{popup.content}</p>}
        {popup.cta_text && popup.cta_url && (
          <a
            href={popup.cta_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-600 underline mt-1 inline-block"
            onClick={() => onDismiss(popup)}
          >
            {popup.cta_text}
          </a>
        )}
        {popup.seen_behavior === 'snooze' && popup.snooze_minutes && (
          <button onClick={() => onDismiss(popup, popup.snooze_minutes)} className="text-xs text-gray-400 underline mt-1 block">
            תזכיר לי מאוחר יותר
          </button>
        )}
      </div>
      <button onClick={() => onDismiss(popup)} className="text-gray-300 hover:text-gray-500 shrink-0">
        <X size={16} />
      </button>
    </div>
  );
}
