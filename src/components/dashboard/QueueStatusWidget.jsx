import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, Clock, ChevronLeft, CheckCircle2, XCircle, Eye } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

function WaitMins({ ts }) {
  const [mins, setMins] = useState(0);
  useEffect(() => {
    if (!ts) return;
    const update = () => setMins(Math.round((Date.now() - new Date(ts).getTime()) / 60000));
    update();
    const t = setInterval(update, 30000);
    return () => clearInterval(t);
  }, [ts]);
  return <span>{mins} דק'</span>;
}

const PREF_LABEL = { inside: '🏠 פנים', outside: '🌳 חוץ', no_preference: '🤷 לא משנה' };

export default function QueueStatusWidget() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => {
    try {
      const all = await base44.entities.QueueEntry.filter({ status: { $in: ['pending', 'active'] } });
      setEntries(all);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const unsub = base44.entities.QueueEntry.subscribe(() => load());
    return () => unsub();
  }, []);

  const pending = entries.filter(e => e.status === 'pending');
  const active = entries.filter(e => e.status === 'active').sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
  const total = pending.length + active.length;

  return (
    <>
      <Card className={`transition-all ${total > 0 ? 'border-blue-200' : ''}`}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className={`p-2.5 rounded-xl ${total > 0 ? 'bg-blue-100' : 'bg-slate-100'}`}>
              <Users className={`w-5 h-5 ${total > 0 ? 'text-blue-600' : 'text-slate-500'}`} />
            </div>
            <span className="text-xs text-muted-foreground font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block" />
              חי
            </span>
          </div>
          <p className="text-2xl font-black text-foreground">{loading ? '...' : total}</p>
          <p className="text-sm font-semibold text-muted-foreground mt-1">🎫 תור נוכחי</p>
          {!loading && total > 0 && (
            <div className="flex gap-3 mt-2">
              {pending.length > 0 && <span className="text-xs text-orange-600 flex items-center gap-1"><Clock className="w-3 h-3" />{pending.length} ממתינים</span>}
              {active.length > 0 && <span className="text-xs text-blue-600 flex items-center gap-1"><Users className="w-3 h-3" />{active.length} פעילים</span>}
            </div>
          )}

          {/* כפתורי פעולה */}
          <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
            <button
              onClick={() => setOpen(true)}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 py-2 rounded-xl transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              מבט מהיר
            </button>
            <Link
              to={createPageUrl("QueueDashboard")}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-xl transition-colors"
            >
              פתח דשבורד
              <ChevronLeft className="w-3.5 h-3.5" />
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* מבט מהיר - דיאלוג */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              תור נוכחי
              <span className="text-sm font-normal text-muted-foreground">({total} ממתינים)</span>
            </DialogTitle>
          </DialogHeader>

          {/* סטטיסטיקה */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-yellow-700">{pending.length}</p>
              <p className="text-xs text-yellow-600">ממתינים לאישור</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-blue-700">{active.length}</p>
              <p className="text-xs text-blue-600">פעילים בתור</p>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-indigo-700">
                {entries.reduce((s, e) => s + (e.party_size || 0), 0)}
              </p>
              <p className="text-xs text-indigo-600">סועדים כולל</p>
            </div>
          </div>

          {/* ממתינים לאישור */}
          {pending.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-bold text-yellow-700 mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse inline-block" />
                ממתינים לאישור ({pending.length})
              </p>
              <div className="space-y-2">
                {pending.map(e => (
                  <div key={e.id} className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base font-black text-gray-800 truncate">{e.customer_name}</span>
                      <span className="text-xs bg-white border border-yellow-300 px-1.5 py-0.5 rounded-full font-bold flex-shrink-0">{e.party_size} 👥</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 mr-2">
                      {e.seating_preference && e.seating_preference !== 'no_preference' && (
                        <span className="text-xs text-gray-500">{PREF_LABEL[e.seating_preference]}</span>
                      )}
                      <span className="text-xs text-gray-400">
                        {new Date(e.timestamp_register).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* תור פעיל */}
          {active.length > 0 && (
            <div>
              <p className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                תור פעיל ({active.length})
              </p>
              <div className="space-y-2">
                {active.map((e, i) => (
                  <div key={e.id} className="flex items-center gap-3 bg-white border border-blue-100 rounded-xl px-3 py-2.5 shadow-sm">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-white flex-shrink-0 text-sm ${i === 0 ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-blue-400'}`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-gray-800 truncate">{e.customer_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500">{e.party_size} סועדים</span>
                        {e.seating_preference && e.seating_preference !== 'no_preference' && (
                          <span className="text-xs text-gray-400">{PREF_LABEL[e.seating_preference]}</span>
                        )}
                        {e.customer_notes && <span className="text-xs text-amber-600 truncate">💬 {e.customer_notes}</span>}
                      </div>
                    </div>
                    <div className="text-xs text-blue-600 font-semibold flex-shrink-0">
                      <Clock className="w-3 h-3 inline ml-0.5" />
                      <WaitMins ts={e.timestamp_approved} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {total === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">התור ריק כרגע</p>
            </div>
          )}

          <Link
            to={createPageUrl("QueueDashboard")}
            onClick={() => setOpen(false)}
            className="mt-4 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors text-sm"
          >
            פתח דשבורד מארחת מלא
            <ChevronLeft className="w-4 h-4" />
          </Link>
        </DialogContent>
      </Dialog>
    </>
  );
}