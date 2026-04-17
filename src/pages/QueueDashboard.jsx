import React, { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { sendQueueSms } from '@/functions/sendQueueSms';
import { sendQueuePush } from '@/functions/sendQueuePush';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Check, X, Gift, UserCheck, Clock, Users, RefreshCw, QrCode } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const STATUS_LABELS = {
  pending: { label: 'ממתין לאישור', color: 'bg-yellow-100 text-yellow-800' },
  active: { label: 'פעיל בתור', color: 'bg-blue-100 text-blue-800' },
  seated: { label: 'הוּשב', color: 'bg-green-100 text-green-800' },
  abandoned: { label: 'נטש', color: 'bg-red-100 text-red-800' },
};

function WaitTime({ timestamp_approved }) {
  const [mins, setMins] = useState(0);
  useEffect(() => {
    if (!timestamp_approved) return;
    const update = () => setMins(Math.round((Date.now() - new Date(timestamp_approved).getTime()) / 60000));
    update();
    const t = setInterval(update, 30000);
    return () => clearInterval(t);
  }, [timestamp_approved]);
  return <span className="text-blue-600 font-semibold">{mins} דק'</span>;
}

function PartySizeIcon({ size }) {
  if (size <= 2) return <span className="text-pink-500">👫</span>;
  if (size === 3) return <span className="text-purple-500">👨‍👩‍👦</span>;
  return <span className="text-orange-500">👨‍👩‍👧‍👦</span>;
}

export default function QueueDashboard() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState(false);
  const [smsSent, setSmsSent] = useState({}); // track sent SMS per entry id
  const prevFirstActiveRef = useRef(null);
  const qrUrl = `${window.location.origin}/QueueJoin`;

  // שלח Push + SMS כ-fallback
  const sendNotification = async (entryId, phone, message, pushTitle) => {
    // נסה Push קודם
    try {
      const res = await sendQueuePush({ entryId, title: pushTitle, body: message });
      if (res?.data?.skipped) throw new Error('no subscription');
    } catch (e) {
      // fallback ל-SMS
      try { await sendQueueSms({ to: phone, message }); } catch (_) {}
    }
  };

  const fetchEntries = useCallback(async () => {
    const all = await base44.entities.QueueEntry.list('-timestamp_register', 300);
    setEntries(all);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEntries();
    const interval = setInterval(fetchEntries, 8000);
    return () => clearInterval(interval);
  }, [fetchEntries]);

  // שלח SMS אוטומטי כשמישהו הופך להיות הבא בתור
  useEffect(() => {
    const activeQueue = entries
      .filter(e => e.status === 'active')
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));

    if (activeQueue.length === 0) return;

    const firstEntry = activeQueue[0];
    const prevFirst = prevFirstActiveRef.current;

    // אם הראשון בתור השתנה ולא שלחנו לו עדיין
    if (prevFirst && prevFirst !== firstEntry.id && !smsSent[firstEntry.id + '_next']) {
      setSmsSent(prev => ({ ...prev, [firstEntry.id + '_next']: true }));
      sendNotification(
        firstEntry.id,
        firstEntry.phone,
        `שלום ${firstEntry.customer_name}! 🎉 אתם הבאים בתור - השולחן שלכם מתפנה עכשיו!`,
        '🎯 הגיע תורכם!'
      );
    }

    prevFirstActiveRef.current = firstEntry.id;
  }, [entries]);

  const pendingEntries = entries.filter(e => e.status === 'pending')
    .sort((a, b) => new Date(a.timestamp_register) - new Date(b.timestamp_register));

  const activeEntries = entries.filter(e => e.status === 'active')
    .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));

  const handleApprove = async (entry) => {
    const now = new Date().toISOString();
    const maxOrder = Math.max(0, ...activeEntries.map(e => e.sort_order ?? 0));
    await base44.entities.QueueEntry.update(entry.id, {
      status: 'active',
      timestamp_approved: now,
      sort_order: maxOrder + 1,
    });
    fetchEntries();
  };

  const handleSeat = async (entry) => {
    await base44.entities.QueueEntry.update(entry.id, {
      status: 'seated',
      timestamp_end: new Date().toISOString(),
    });
    sendNotification(
      entry.id,
      entry.phone,
      `השולחן שלכם מוכן! המארחת ממתינה לכם. בתיאבון! 🍽️`,
      '✅ השולחן מוכן!'
    );
    fetchEntries();
  };

  const handleAbandon = async (entry) => {
    await base44.entities.QueueEntry.update(entry.id, {
      status: 'abandoned',
      timestamp_end: new Date().toISOString(),
    });
    fetchEntries();
  };

  const handleToggleTreat = async (entry) => {
    await base44.entities.QueueEntry.update(entry.id, { treated: !entry.treated });
    fetchEntries();
  };

  const onDragEnd = async (result) => {
    if (!result.destination) return;
    const reordered = Array.from(activeEntries);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);

    // עדכון sort_order
    setEntries(prev => {
      const updated = [...prev];
      reordered.forEach((item, idx) => {
        const i = updated.findIndex(e => e.id === item.id);
        if (i >= 0) updated[i] = { ...updated[i], sort_order: idx + 1 };
      });
      return updated;
    });

    await Promise.all(
      reordered.map((item, idx) =>
        base44.entities.QueueEntry.update(item.id, { sort_order: idx + 1 })
      )
    );
  };

  return (
    <div className="p-4 sm:p-6 min-h-screen bg-gray-50" dir="rtl">
      {/* כותרת */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-800">🎯 ניהול תור - מסעדת עלינא</h1>
          <p className="text-gray-500 text-sm">דאשבורד מארחת בזמן אמת</p>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <span className="w-2 h-2 bg-green-400 rounded-full inline-block"></span>
            SMS פעיל
          </span>
          <Button variant="outline" size="sm" onClick={fetchEntries}>
            <RefreshCw className="w-4 h-4 ml-1" /> רענן
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowQR(!showQR)}>
            <QrCode className="w-4 h-4 ml-1" /> QR
          </Button>
        </div>
      </div>

      {/* QR Modal */}
      {showQR && (
        <Card className="mb-4 border-2 border-emerald-300 bg-emerald-50">
          <CardContent className="p-4 text-center">
            <p className="font-bold text-emerald-800 mb-2">קישור להרשמה לתור:</p>
            <div className="bg-white rounded-xl p-3 border border-emerald-200">
              <p className="text-sm text-blue-600 break-all">{qrUrl}</p>
            </div>
            <p className="text-xs text-gray-500 mt-2">שלח את הקישור ללקוחות או הדפס QR מ-qr.io</p>
          </CardContent>
        </Card>
      )}

      {/* סטטיסטיקה */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-black text-yellow-700">{pendingEntries.length}</p>
            <p className="text-xs text-yellow-600">ממתינים לאישור</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-black text-blue-700">{activeEntries.length}</p>
            <p className="text-xs text-blue-600">פעילים בתור</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-black text-green-700">
              {entries.filter(e => e.status === 'seated').length}
            </p>
            <p className="text-xs text-green-600">הוּשבו היום</p>
          </CardContent>
        </Card>
      </div>

      {/* ממתינים לאישור */}
      {pendingEntries.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-yellow-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse inline-block"></span>
            ממתינים לאישור נוכחות ({pendingEntries.length})
          </h2>
          <div className="space-y-2">
            {pendingEntries.map(entry => (
              <Card key={entry.id} className="border-yellow-300 bg-yellow-50">
                <CardContent className="p-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <PartySizeIcon size={entry.party_size} />
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800 truncate">{entry.customer_name}</p>
                      <p className="text-xs text-gray-500">{entry.phone} · {entry.party_size} סועדים</p>
                      <p className="text-xs text-gray-400">
                        נרשם: {new Date(entry.timestamp_register).toLocaleTimeString('he-IL')}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white flex-shrink-0"
                    onClick={() => handleApprove(entry)}
                  >
                    <UserCheck className="w-4 h-4 ml-1" />
                    אשר נוכחות
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* תור פעיל - Drag & Drop */}
      <div>
        <h2 className="text-lg font-bold text-blue-700 mb-3 flex items-center gap-2">
          <Clock className="w-5 h-5" />
          תור פעיל ({activeEntries.length})
          <span className="text-xs font-normal text-gray-400">ניתן לגרירה לשינוי סדר</span>
        </h2>

        {activeEntries.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-gray-400">
              <Users className="w-10 h-10 mx-auto mb-2" />
              <p>התור ריק כרגע</p>
            </CardContent>
          </Card>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="queue">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                  {activeEntries.map((entry, index) => (
                    <Draggable key={entry.id} draggableId={entry.id} index={index}>
                      {(provided, snapshot) => (
                        <Card
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={`border-blue-200 ${snapshot.isDragging ? 'shadow-xl rotate-1 bg-blue-50' : 'bg-white'}`}
                        >
                          <CardContent className="p-3 flex items-center gap-3">
                            {/* מספר בתור */}
                            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-sm flex-shrink-0">
                              {index + 1}
                            </div>

                            {/* פרטים */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-gray-800 truncate">{entry.customer_name}</p>
                                <PartySizeIcon size={entry.party_size} />
                                <span className="text-xs text-gray-500">{entry.party_size}</span>
                                {entry.treated && <span title="קיבל פינוק">🎁</span>}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                                <span>{entry.phone}</span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <WaitTime timestamp_approved={entry.timestamp_approved} />
                                </span>
                              </div>
                            </div>

                            {/* כפתורי פעולה */}
                            <div className="flex gap-1 flex-shrink-0">
                              <button
                                onClick={() => handleToggleTreat(entry)}
                                title="פינוק"
                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all text-sm ${
                                  entry.treated ? 'bg-pink-200 text-pink-700' : 'bg-gray-100 hover:bg-pink-100'
                                }`}
                              >
                                🎁
                              </button>
                              <button
                                onClick={() => handleSeat(entry)}
                                title="הושב"
                                className="w-8 h-8 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 flex items-center justify-center transition-all"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleAbandon(entry)}
                                title="נטש"
                                className="w-8 h-8 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 flex items-center justify-center transition-all"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>
    </div>
  );
}