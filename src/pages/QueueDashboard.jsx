import React, { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { sendQueueSms } from '@/functions/sendQueueSms';
import { sendQueuePush } from '@/functions/sendQueuePush';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Check, X, Gift, UserCheck, Clock, Users, RefreshCw, QrCode, AlertCircle, Star, History } from 'lucide-react';
import TreatsReport from '../components/dashboard/TreatsReport';
import TonightBoardCard from '../components/dashboard/TonightBoardCard';
import RecentAbandonedSection from '../components/dashboard/RecentAbandonedSection';
import TablePicker from '../components/dashboard/TablePicker';
import { QRCodeSVG } from 'qrcode.react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { sendFeedbackSms } from '@/functions/sendFeedbackSms';
import PageHeader from '@/components/shared/PageHeader';

const RESTAURANT_LAT = 31.964780873771108;
const RESTAURANT_LNG = 34.79326668650769;
const MAX_DISTANCE_METERS = 100;

function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function isGuestFarAway(entry) {
  if (!entry.last_lat || !entry.last_lng) return false;
  // אם המיקום ישן מ-2 דקות, לא נציג אזהרה
  if (entry.last_location_at) {
    const age = Date.now() - new Date(entry.last_location_at).getTime();
    if (age > 2 * 60 * 1000) return false;
  }
  return calcDistance(entry.last_lat, entry.last_lng, RESTAURANT_LAT, RESTAURANT_LNG) > MAX_DISTANCE_METERS;
}

const STATUS_LABELS = {
  pending: { label: 'ממתין לאישור', color: 'bg-[#F4ECD8] text-yellow-800' },
  active: { label: 'פעיל בתור', color: 'bg-[#F4ECD8] text-[#2E3819]' },
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
  return <span className="text-[#44512C] font-semibold">{mins} דק'</span>;
}

function PartySizeIcon({ size }) {
  if (size <= 2) return <span className="text-[#A04A2E]">👫</span>;
  if (size === 3) return <span className="text-[#A04A2E]">👨‍👩‍👦</span>;
  return <span className="text-orange-500">👨‍👩‍👧‍👦</span>;
}

export default function QueueDashboard() {
  const _branding = useTenantBranding();
  const brandName = _branding?.name || 'המסעדה';
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState(false);
  const [geofencingEnabled, setGeofencingEnabled] = useState(true);
  const [restaurantProfileId, setRestaurantProfileId] = useState(null);
  const [smsSent, setSmsSent] = useState({});
  const [partySizeFilter, setPartySizeFilter] = useState(null);
  const [countdowns, setCountdowns] = useState({}); // entryId -> secondsLeft (seat countdown)
  const [callCountdowns, setCallCountdowns] = useState({}); // entryId -> secondsLeft (call countdown)
  const [lowFeedbacks, setLowFeedbacks] = useState([]);
  const [bonusAmount, setBonusAmount] = useState({});
  const [treats, setTreats] = useState([]);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [historyPhone, setHistoryPhone] = useState(null);
  const [historyEntries, setHistoryEntries] = useState([]);
  const [manualForm, setManualForm] = useState({ name: '', phone: '', party_size: 2 });
  const [manualLoading, setManualLoading] = useState(false);
  const [estimatedWaitInput, setEstimatedWaitInput] = useState({});
  const [editingEstimate, setEditingEstimate] = useState(null);
  const [approvingEntry, setApprovingEntry] = useState(null);
  const [approvalWaitTime, setApprovalWaitTime] = useState(null);
  const prevFirstActiveRef = useRef(null);
  const countdownRef = useRef({});
  const callCountdownRef = useRef({});
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
    try {
      const all = await base44.entities.QueueEntry.list('-timestamp_register', 100);
      setEntries(all);
      setLoading(false);
    } catch (err) {
      if (err.status === 429) {
        console.warn('Rate limited - will retry in 30 seconds');
        setTimeout(() => fetchEntries(), 30000);
      }
    }
  }, []);

  useEffect(() => {
    fetchEntries();
    const interval = setInterval(fetchEntries, 15000); // increased from 8s to 15s
    return () => clearInterval(interval);
  }, [fetchEntries]);

  useEffect(() => {
    base44.entities.RestaurantProfile.list().then(profiles => {
      if (profiles.length > 0) {
        setRestaurantProfileId(profiles[0].id);
        setGeofencingEnabled(profiles[0].geofencing_enabled !== false);
      }
    }).catch(err => {
      if (err?.status !== 429) console.error(err);
    });
    
    base44.entities.TimeTreat.filter({ is_active: true }).then(t => setTreats(t)).catch(err => {
      if (err?.status !== 429) console.error(err);
    });
  }, []);

  // התראות נוספות כשמישהו חדש נרשם
  useEffect(() => {
    const sub = base44.entities.QueueEntry.subscribe(event => {
      if (event.type === 'create' && event.data?.status === 'pending') {
        // שמור notification
        const msg = `📍 הרשמה חדשה! ${event.data.customer_name} - ${event.data.party_size} סועדים`;
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`${brandName} - בקשה להשלמה`, { body: msg });
        }
      }
    });
    return () => sub();
  }, []);

  const toggleGeofencing = async () => {
    const newVal = !geofencingEnabled;
    setGeofencingEnabled(newVal);
    if (restaurantProfileId) {
      await base44.entities.RestaurantProfile.update(restaurantProfileId, { geofencing_enabled: newVal });
    } else {
      // צור פרופיל חדש אם לא קיים
      const profile = await base44.entities.RestaurantProfile.create({ restaurant_name: brandName, geofencing_enabled: newVal });
      setRestaurantProfileId(profile.id);
    }
  };

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

  const filterByParty = (list) =>
    partySizeFilter ? list.filter(e => e.party_size === partySizeFilter) : list;

  const pendingEntries = filterByParty(
    entries.filter(e => e.status === 'pending')
      .sort((a, b) => new Date(a.timestamp_register) - new Date(b.timestamp_register))
  );

  const activeEntries = filterByParty(
    entries.filter(e => e.status === 'active')
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
  );

  // ספירה לפי גודל קבוצה (רק active + pending)
  const partySizeCounts = entries
    .filter(e => e.status === 'pending' || e.status === 'active')
    .reduce((acc, e) => {
      acc[e.party_size] = (acc[e.party_size] || 0) + 1;
      return acc;
    }, {});

  // סועדים כולל בתור (active + pending)
  const totalDinersInQueue = entries
    .filter(e => e.status === 'pending' || e.status === 'active')
    .reduce((sum, e) => sum + (e.party_size || 0), 0);

  // זמן המתנה ממוצע לפי גודל קבוצה (רק active עם timestamp_approved)
  const avgWaitBySize = entries
    .filter(e => e.status === 'active' && e.timestamp_approved)
    .reduce((acc, e) => {
      const mins = Math.round((Date.now() - new Date(e.timestamp_approved).getTime()) / 60000);
      const key = e.party_size;
      if (!acc[key]) acc[key] = { total: 0, count: 0 };
      acc[key].total += mins;
      acc[key].count += 1;
      return acc;
    }, {});

  const handleApprove = async (entry) => {
    setApprovingEntry(entry);
    setApprovalWaitTime('');
  };

  const confirmApproval = async () => {
    if (!approvingEntry) return;
    const now = new Date().toISOString();
    const maxOrder = Math.max(0, ...activeEntries.map(e => e.sort_order ?? 0));
    const waitMinutes = approvalWaitTime ? parseInt(approvalWaitTime) : null;
    
    await base44.entities.QueueEntry.update(approvingEntry.id, {
      status: 'active',
      timestamp_approved: now,
      sort_order: maxOrder + 1,
      ...(waitMinutes && { estimated_wait_time: waitMinutes }),
    });
    
    setApprovingEntry(null);
    setApprovalWaitTime(null);
    fetchEntries();
  };

  // מונה 3 דקות אחרי "השולחן מוכן" (seated countdown)
  const startCountdown = (entryId, totalSecs = 180) => {
    if (countdownRef.current[entryId]) clearInterval(countdownRef.current[entryId]);
    setCountdowns(prev => ({ ...prev, [entryId]: totalSecs }));
    countdownRef.current[entryId] = setInterval(() => {
      setCountdowns(prev => {
        const left = (prev[entryId] || 0) - 1;
        if (left <= 0) {
          clearInterval(countdownRef.current[entryId]);
          delete countdownRef.current[entryId];
          return { ...prev, [entryId]: 0 };
        }
        return { ...prev, [entryId]: left };
      });
    }, 1000);
  };

  // קריאה למזדמן — מונה 3 דק' + שמירה ב-DB
  const handleCallGuest = async (entry) => {
    const now = new Date().toISOString();
    await base44.entities.QueueEntry.update(entry.id, { seat_called_at: now });
    sendNotification(
      entry.id,
      entry.phone,
      `🔔 ${brandName} קוראת לכם! השולחן שלכם מוכן — יש לכם 3 דקות להגיע למארחת!`,
      '🔔 הגיע תורכם!'
    );
    // התחל מונה 3 דקות
    if (callCountdownRef.current[entry.id]) clearInterval(callCountdownRef.current[entry.id]);
    setCallCountdowns(prev => ({ ...prev, [entry.id]: 180 }));
    callCountdownRef.current[entry.id] = setInterval(() => {
      setCallCountdowns(prev => {
        const left = (prev[entry.id] || 0) - 1;
        if (left <= 0) {
          clearInterval(callCountdownRef.current[entry.id]);
          delete callCountdownRef.current[entry.id];
          return { ...prev, [entry.id]: 0 };
        }
        return { ...prev, [entry.id]: left };
      });
    }, 1000);
  };

  // "ישב" אחרי קריאה למזדמן
  const handleSeatAfterCall = async (entry) => {
    if (callCountdownRef.current[entry.id]) clearInterval(callCountdownRef.current[entry.id]);
    setCallCountdowns(prev => { const n = {...prev}; delete n[entry.id]; return n; });
    const now = new Date().toISOString();
    await base44.entities.QueueEntry.update(entry.id, {
      status: 'seated',
      timestamp_end: now,
      timestamp_seated: now,
      seat_called_at: null,
    });
    fetchEntries();
  };

  // "עבור לשולחן הבא" — מסמן נטש ומקדם לבא
  const handleSkipToNext = async (entry) => {
    if (callCountdownRef.current[entry.id]) clearInterval(callCountdownRef.current[entry.id]);
    setCallCountdowns(prev => { const n = {...prev}; delete n[entry.id]; return n; });
    await base44.entities.QueueEntry.update(entry.id, {
      status: 'abandoned',
      timestamp_end: new Date().toISOString(),
      notes: 'לא הגיע בזמן — עבר לשולחן הבא',
    });
    fetchEntries();
  };

  const handleSeat = async (entry) => {
    const now = new Date().toISOString();
    await base44.entities.QueueEntry.update(entry.id, {
      status: 'seated',
      timestamp_end: now,
      timestamp_seated: now,
      seat_countdown_active: true,
    });
    sendNotification(
      entry.id,
      entry.phone,
      `🍽️ ${brandName} מחכה לכם! השולחן שלכם מוכן — יש לכם 3 דקות להגיע למארחת!`,
      '✅ השולחן מוכן!'
    );
    startCountdown(entry.id);

    // שלח SMS פידבק בעוד 3 שעות (scheduled - כאן נסמן ב-DB)
    // הסמסאוטומציה תרוץ דרך שדה feedback_sms_sent
    fetchEntries();
  };

  // בדוק לקוחות שהוּשבו לפני 3 שעות ועדיין לא קיבלו SMS פידבק
  useEffect(() => {
    const checkFeedback = async () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const toSend = entries.filter(e =>
        e.status === 'seated' &&
        !e.feedback_sms_sent &&
        e.timestamp_end &&
        new Date(e.timestamp_end) < threeHoursAgo
      );
      for (const e of toSend) {
        await base44.entities.QueueEntry.update(e.id, { feedback_sms_sent: true });
        sendFeedbackSms({ entryId: e.id, phone: e.phone, customerName: e.customer_name }).catch(() => {});
      }
      // פידבקים נמוכים שטרם טופלו
      const low = entries.filter(e => e.feedback_rating && e.feedback_rating <= 2);
      setLowFeedbacks(low);
    };
    if (entries.length) checkFeedback();
  }, [entries]);

  // בדיקת קרבה — שולח הודעה ללקוח + מסמן pending
  const handleProximityCheck = async (entry) => {
    const now = new Date().toISOString();
    try {
      await base44.entities.QueueEntry.update(entry.id, {
        proximity_check_at: now,
        proximity_response: 'pending',
      });
    } catch (err) {
      if (err?.status === 429) return; // skip on rate limit
      throw err;
    }
    sendNotification(
      entry.id,
      entry.phone,
      `שלום ${entry.customer_name}! המארחת שואלת — האם אתם בסביבת המסעדה? יש לכם 3 דקות לענות.`,
      '📍 האם אתם בסביבה?'
    );
    // רענן מ-cache בעוד 15 שניות, לא מיד
    setTimeout(() => fetchEntries(), 15000);
    // אחרי 3 דקות — אם לא ענו, הפוך לאדום
    setTimeout(async () => {
      const current = entries.find(e => e.id === entry.id);
      if (current && current.proximity_response === 'pending') {
        await base44.entities.QueueEntry.update(entry.id, { proximity_response: 'no' }).catch(() => {});
      }
    }, 3 * 60 * 1000);
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

  const handleGiveBonus = async (entry) => {
    const bonus = bonusAmount[entry.id] || 100;
    await base44.entities.QueueEntry.update(entry.id, {
      time_credits_earned: (entry.time_credits_earned || 0) + bonus,
    });
    setBonusAmount(prev => { const n = {...prev}; delete n[entry.id]; return n; });
    fetchEntries();
  };

  const openCustomerHistory = async (phone) => {
    const allEntries = await base44.entities.QueueEntry.list('-timestamp_register', 500);
    const phoneHistory = allEntries.filter(e => e.phone === phone);
    setHistoryPhone(phone);
    setHistoryEntries(phoneHistory);
  };

  const handleSaveEstimatedWait = async (entryId, minutes) => {
    if (!minutes || minutes < 0) {
      await base44.entities.QueueEntry.update(entryId, { estimated_wait_time: null }).catch(() => {});
    } else {
      await base44.entities.QueueEntry.update(entryId, { estimated_wait_time: minutes }).catch(() => {});
    }
    setEditingEstimate(null);
    setEstimatedWaitInput(prev => { const n = {...prev}; delete n[entryId]; return n; });
    fetchEntries();
  };

  const handleManualAdd = async () => {
    if (!manualForm.name.trim() || !manualForm.phone.trim()) {
      alert('נא למלא שם ומספר טלפון');
      return;
    }
    setManualLoading(true);
    try {
      const newEntry = await base44.entities.QueueEntry.create({
        customer_name: manualForm.name.trim(),
        phone: manualForm.phone.trim(),
        party_size: manualForm.party_size || 2,
        status: 'active',
        timestamp_register: new Date().toISOString(),
        timestamp_approved: new Date().toISOString(),
        sort_order: (Math.max(0, ...entries.filter(e => e.status === 'active').map(e => e.sort_order ?? 0)) + 1),
      });

      // שלח SMS עם קישור
      const guestUrl = `${window.location.origin}/QueueJoin?id=${newEntry.id}`;
      await sendQueueSms({
        to: manualForm.phone.trim(),
        message: `שלום ${manualForm.name}! 🍽️ קישור לדף התור שלך: ${guestUrl}`
      }).catch(() => {});

      setManualForm({ name: '', phone: '', party_size: 2 });
      setShowManualAdd(false);
      fetchEntries();
    } catch (e) {
      alert('שגיאה: ' + e.message);
    } finally {
      setManualLoading(false);
    }
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
    <div className="p-4 sm:p-6 min-h-screen bg-gradient-to-br from-[#FAF5E8] via-[#F7EFDD] to-[#F1E6CE]" dir="rtl">
      {/* כותרת */}
      <PageHeader
        title={`ניהול תור - מסעדת ${brandName}`}
        subtitle="דאשבורד מארחת בזמן אמת"
        icon={Users}
        action={
          <div className="flex gap-2 items-center flex-wrap">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <span className="w-2 h-2 bg-green-400 rounded-full inline-block"></span>
              SMS פעיל
            </span>
            <Button variant="outline" size="sm" onClick={() => setShowManualAdd(!showManualAdd)}>
              ➕ הוסף ידנית
            </Button>
            <Button variant="outline" size="sm" onClick={fetchEntries}>
              <RefreshCw className="w-4 h-4 ml-1" /> רענן
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowQR(!showQR)}>
              <QrCode className="w-4 h-4 ml-1" /> QR
            </Button>
            <button
              onClick={toggleGeofencing}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all ${
                geofencingEnabled
                  ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                  : 'bg-gray-100 border-gray-300 text-gray-500'
              }`}
            >
              <span>{geofencingEnabled ? '📍' : '📍'}</span>
              {geofencingEnabled ? 'מיקום: פעיל' : 'מיקום: כבוי'}
            </button>
          </div>
        }
      />

      {/* Modal הוסף ידנית */}
      {showManualAdd && (
        <Card className="mb-4 border-2 border-emerald-300 bg-emerald-50">
          <CardContent className="p-4">
            <p className="font-bold text-emerald-800 mb-4">הוסף לקוח ידנית:</p>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="שם מלא"
                value={manualForm.name}
                onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                className="w-full border-2 border-emerald-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-400"
              />
              <input
                type="tel"
                placeholder="מספר טלפון"
                value={manualForm.phone}
                onChange={(e) => setManualForm({ ...manualForm, phone: e.target.value })}
                className="w-full border-2 border-emerald-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-400"
              />
              <div>
                <label className="text-xs font-bold text-emerald-700 block mb-2">🍴 כמות סועדים</label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                    <button
                      key={n}
                      onClick={() => setManualForm({ ...manualForm, party_size: n })}
                      className={`py-2 rounded-lg font-bold text-sm transition-all ${
                        (manualForm.party_size || 1) === n
                          ? 'bg-emerald-600 text-white shadow-md'
                          : 'bg-white text-emerald-600 hover:bg-emerald-100'
                      }`}
                    >
                      {n === 8 ? '8+' : n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleManualAdd}
                  disabled={manualLoading}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-2 rounded-xl text-sm transition-all"
                >
                  {manualLoading ? 'שומר...' : '✅ הוסף + שלח SMS'}
                </button>
                <button
                  onClick={() => { setShowManualAdd(false); setManualForm({ name: '', phone: '' }); }}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2 rounded-xl text-sm transition-all"
                >
                  ✕ ביטול
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* QR Modal */}
      {showQR && (
        <Card className="mb-4 border-2 border-emerald-300 bg-emerald-50">
          <CardContent className="p-4 text-center">
            <p className="font-bold text-emerald-800 mb-3">סרקו להצטרפות לתור:</p>
            <div className="flex justify-center mb-3">
              <div className="bg-white p-3 rounded-2xl shadow-md inline-block">
                <QRCodeSVG value={qrUrl} size={180} bgColor="#ffffff" fgColor="#064e3b" level="H" />
              </div>
            </div>
            <div className="bg-white rounded-xl p-2 border border-emerald-200">
              <p className="text-xs text-[#44512C] break-all">{qrUrl}</p>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(qrUrl)}
              className="mt-2 text-xs text-emerald-700 underline"
            >
              העתק קישור
            </button>
          </CardContent>
        </Card>
      )}

      {/* לוח המשחקים של הערב — מוצג רק כשמישהו שיחק */}
      <TonightBoardCard />

      {/* דוח פינוקים */}
      <div className="mb-6">
        <TreatsReport />
      </div>

      {/* סטטיסטיקה */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="bg-[#FAF5E8] border-yellow-200">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-black text-yellow-700">{pendingEntries.length}</p>
            <p className="text-xs text-yellow-600">ממתינים לאישור</p>
          </CardContent>
        </Card>
        <Card className="bg-[#F4ECD8] border-[#E8D9B5]">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-black text-[#44512C]">{activeEntries.length}</p>
            <p className="text-xs text-[#44512C]">פעילים בתור</p>
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

      {/* התראות פידבק נמוך */}
      {lowFeedbacks.length > 0 && (
        <div className="mb-4 space-y-2">
          {lowFeedbacks.map(e => (
            <Card key={e.id} className="border-red-300 bg-red-50">
              <CardContent className="p-3 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-bold text-red-700 text-sm">פידבק נמוך! ⚠️ {e.customer_name}</p>
                  <p className="text-red-500 text-xs">דירג {'⭐'.repeat(e.feedback_rating)} — טפל לפני שיכתוב ביקורת רעה</p>
                </div>
                <span className="text-xs text-red-400 flex-shrink-0">{e.phone}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Live Stats - סועדים ממוצע המתנה */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card className="bg-[#F4ECD8] border-indigo-200">
          <CardContent className="p-3 text-center">
            <p className="text-3xl font-black text-[#7A3722]">{totalDinersInQueue}</p>
            <p className="text-xs text-[#A04A2E] font-medium">סועדים כולל בתור עכשיו</p>
          </CardContent>
        </Card>
        <Card className="bg-orange-50 border-orange-200">
          <CardContent className="p-3">
            <p className="text-xs font-bold text-orange-700 mb-2 text-center">זמן המתנה ממוצע לפי גודל</p>
            {Object.keys(avgWaitBySize).length === 0 ? (
              <p className="text-xs text-gray-400 text-center">אין נתונים</p>
            ) : (
              <div className="space-y-1">
                {Object.entries(avgWaitBySize)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([size, { total, count }]) => (
                    <div key={size} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">
                        {Number(size) === 1 ? '👤' : Number(size) === 2 ? '👫' : Number(size) <= 3 ? '👨‍👩‍👦' : '👨‍👩‍👧‍👦'}
                        {' '}{size} סועדים
                      </span>
                      <span className="font-black text-orange-700">{Math.round(total / count)} דק'</span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* פילטר גודל קבוצה */}
      {Object.keys(partySizeCounts).length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 items-center">
          <span className="text-sm font-bold text-gray-600">סנן לפי גודל:</span>
          <button
            onClick={() => setPartySizeFilter(null)}
            className={`px-3 py-1.5 rounded-full text-sm font-bold transition-all ${
              partySizeFilter === null
                ? 'bg-gray-700 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            הכל
          </button>
          {Object.entries(partySizeCounts)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([size, count]) => (
              <button
                key={size}
                onClick={() => setPartySizeFilter(partySizeFilter === Number(size) ? null : Number(size))}
                className={`px-3 py-1.5 rounded-full text-sm font-bold transition-all flex items-center gap-1 ${
                  partySizeFilter === Number(size)
                    ? 'bg-[#44512C] text-white'
                    : 'bg-[#F4ECD8] text-[#44512C] hover:bg-[#F4ECD8]'
                }`}
              >
                {Number(size) === 1 ? '👤' : Number(size) === 2 ? '👫' : Number(size) <= 3 ? '👨‍👩‍👦' : '👨‍👩‍👧‍👦'}
                {size} סועדים
                <span className={`text-xs rounded-full px-1.5 py-0.5 ${
                  partySizeFilter === Number(size) ? 'bg-white text-[#44512C]' : 'bg-[#E8D9B5] text-[#2E3819]'
                }`}>{count}</span>
              </button>
            ))}
        </div>
      )}

      {/* ממתינים לאישור */}
      {pendingEntries.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-yellow-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse inline-block"></span>
            ממתינים לאישור נוכחות ({pendingEntries.length})
          </h2>
          <div className="space-y-2">
            {pendingEntries.map(entry => (
              <Card key={entry.id} className="border-[#D9BD83] bg-[#FAF5E8]">
                <CardContent className="p-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                  <PartySizeIcon size={entry.party_size} />
                  <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-black text-xl text-gray-800 truncate">{entry.customer_name}</p>
                    <div className="flex items-center gap-1 bg-gray-100 rounded-xl px-2.5 py-1 flex-shrink-0">
                      <PartySizeIcon size={entry.party_size} />
                      <span className="font-black text-2xl text-gray-800">{entry.party_size}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 mb-1">
                    <button onClick={() => navigator.clipboard.writeText(entry.customer_name)} className="flex items-center gap-1 text-xs bg-[#F4ECD8] hover:bg-[#F4ECD8] text-[#44512C] border border-[#E8D9B5] px-2 py-1 rounded-lg font-bold transition-all">📋 העתק שם</button>
                    <button onClick={() => navigator.clipboard.writeText(entry.phone)} className="flex items-center gap-1 text-xs bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 px-2 py-1 rounded-lg font-bold transition-all">📋 {entry.phone}</button>
                  </div>
                  <div className="flex gap-1 flex-wrap mt-0.5 mb-1">
                    {entry.seating_preference === 'inside' && <span className="text-xs bg-[#F4ECD8] text-[#44512C] px-2 py-0.5 rounded-full">🏠 בפנים</span>}
                    {entry.seating_preference === 'outside' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">🌳 בחוץ</span>}
                    {(!entry.seating_preference || entry.seating_preference === 'no_preference') && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">🤷 לא משנה</span>}
                    {(entry.table_duration_preference === 'one_hour_only' || entry.table_duration_preference === 'one_hour') && <span className="text-xs bg-orange-100 text-orange-800 font-bold px-2 py-0.5 rounded-full border border-orange-300">✅ בסדר שולחן לשעה</span>}
                    {(!entry.table_duration_preference || entry.table_duration_preference === 'any') && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">❌ צריך יותר משעה</span>}
                  </div>
                  {entry.customer_notes && (
                    <div className="mb-1 bg-[#FAF5E8] border border-yellow-200 rounded-lg px-2 py-1.5">
                      <p className="text-xs text-yellow-800"><span className="font-bold">💬 הערות:</span> {entry.customer_notes}</p>
                    </div>
                  )}
                  <p className="text-xs text-gray-400">
                    נרשם: {new Date(entry.timestamp_register).toLocaleTimeString('he-IL')}
                  </p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => handleApprove(entry)}
                    >
                      <UserCheck className="w-4 h-4 ml-1" />
                      אשר
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (window.confirm(`בטוח למחוק את ${entry.customer_name}?`)) {
                          base44.entities.QueueEntry.delete(entry.id).then(() => fetchEntries()).catch(e => console.error(e));
                        }
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* נטשו לאחרונה */}
      {(() => {
        const recentAbandoned = entries
          .filter(e => e.status === 'abandoned' && e.timestamp_end)
          .filter(e => (Date.now() - new Date(e.timestamp_end).getTime()) < 24 * 60 * 60 * 1000)
          .sort((a, b) => new Date(b.timestamp_end) - new Date(a.timestamp_end))
          .slice(0, 5);
        if (recentAbandoned.length === 0) return null;
        return <RecentAbandonedSection entries={entries} recentAbandoned={recentAbandoned} fetchEntries={fetchEntries} />;
      })()}

      {/* תור פעיל - Drag & Drop */}
      <div>
        <h2 className="text-lg font-bold text-[#44512C] mb-3 flex items-center gap-2">
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
                      {(provided, snapshot) => {
                        const farAway = isGuestFarAway(entry);
                        const proxPending = entry.proximity_response === 'pending' && entry.proximity_check_at;
                        const proxNo = entry.proximity_response === 'no';
                        const proxYes = entry.proximity_response === 'yes';
                        let cardBg = 'bg-white border-[#E8D9B5]';
                        if (snapshot.isDragging) cardBg = 'bg-[#F4ECD8] border-[#E8D9B5]';
                        else if (proxNo) cardBg = 'bg-[#F4ECD8] border-purple-400';
                        else if (proxYes) cardBg = 'bg-green-50 border-green-300';
                        else if (farAway) cardBg = 'bg-red-50 border-red-300';

                        return (
                        <Card
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={`overflow-hidden transition-all shadow-md ${
                            snapshot.isDragging ? 'shadow-xl scale-[1.02]' :
                            proxNo ? 'border-2 border-purple-400' :
                            proxYes ? 'border-2 border-green-400' :
                            farAway ? 'border-2 border-red-300' :
                            'border border-[#F4ECD8]'
                          }`}
                        >
                          {/* פס צבע עליון */}
                          <div className={`h-1.5 w-full ${
                            proxNo ? 'bg-[#A04A2E]' :
                            proxYes ? 'bg-green-500' :
                            farAway ? 'bg-red-400' :
                            index === 0 ? 'bg-gradient-to-l from-[#44512C] to-[#A04A2E]' : 'bg-[#D9BD83]'
                          }`} />

                          <CardContent className="p-3">
                            {/* שורה 1: מספר בתור + שם + סועדים */}
                            <div className="flex items-center gap-2 mb-2">
                              <div className={`w-9 h-9 rounded-2xl text-white flex items-center justify-center font-black text-lg flex-shrink-0 shadow ${
                                proxNo ? 'bg-[#A04A2E]' : proxYes ? 'bg-green-500' : index === 0 ? 'bg-gradient-to-br from-[#44512C] to-[#A04A2E]' : 'bg-[#44512C]'
                              }`}>
                                {index + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className={`font-black text-lg leading-tight truncate ${
                                    proxNo ? 'text-[#7A3722]' : proxYes ? 'text-green-700' : farAway ? 'text-red-600' : 'text-gray-900'
                                  }`}>
                                    {entry.customer_name}
                                    {proxPending && !proxNo && !proxYes && <span className="mr-1 animate-pulse">🟡</span>}
                                    {proxNo && <span className="mr-1">🟣</span>}
                                    {proxYes && <span className="mr-1">🟢</span>}
                                    {farAway && !proxNo && !proxYes && <span className="mr-1">📍❌</span>}
                                    {entry.treated && <span className="mr-1">🎁</span>}
                                  </p>
                                </div>
                              </div>
                              {/* כמות סועדים */}
                              <div className={`flex items-center gap-1 px-3 py-1.5 rounded-2xl flex-shrink-0 shadow-sm ${
                                proxNo ? 'bg-[#F4ECD8]' : proxYes ? 'bg-green-100' : 'bg-[#F4ECD8] border border-[#E8D9B5]'
                              }`}>
                                <PartySizeIcon size={entry.party_size} />
                                <span className="font-black text-2xl text-gray-800">{entry.party_size}</span>
                              </div>
                            </div>

                            {/* שורה 2: כפתורי העתקה */}
                            <div className="flex gap-2 mb-2">
                              <button
                                onClick={() => navigator.clipboard.writeText(entry.customer_name)}
                                className="flex-1 flex items-center justify-center gap-1 text-xs bg-[#F4ECD8] active:bg-[#E8D9B5] text-[#44512C] border border-[#E8D9B5] px-2 py-2 rounded-xl font-bold transition-all"
                              >📋 העתק שם</button>
                              <button
                                onClick={() => navigator.clipboard.writeText(entry.phone)}
                                className="flex-1 flex items-center justify-center gap-1 text-xs bg-green-50 active:bg-green-200 text-green-700 border border-green-200 px-2 py-2 rounded-xl font-bold transition-all"
                              >📞 {entry.phone}</button>
                            </div>

                            {/* שורה 3: תגיות העדפות */}
                            <div className="flex gap-1.5 flex-wrap mb-2">
                              {entry.seating_preference === 'inside' && <span className="text-xs bg-[#F4ECD8] text-[#44512C] px-2.5 py-1 rounded-full font-semibold">🏠 בפנים</span>}
                              {entry.seating_preference === 'outside' && <span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-semibold">🌳 בחוץ</span>}
                              {(!entry.seating_preference || entry.seating_preference === 'no_preference') && <span className="text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">🤷 לא משנה</span>}
                              {(entry.table_duration_preference === 'one_hour_only' || entry.table_duration_preference === 'one_hour') && <span className="text-xs bg-orange-100 text-orange-800 font-bold px-2.5 py-1 rounded-full border border-orange-200">✅ שעה בסדר</span>}
                              {(!entry.table_duration_preference || entry.table_duration_preference === 'any') && <span className="text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded-full font-semibold">⏳ צריך יותר</span>}
                              {proxNo && <span className="text-xs bg-[#F4ECD8] text-[#7A3722] px-2.5 py-1 rounded-full">🟣 לא בסביבה</span>}
                              {proxYes && <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full">🟢 בסביבה</span>}
                            </div>

                            {/* הערות לקוח */}
                            {entry.customer_notes && (
                              <div className="mb-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                <p className="text-xs text-amber-800"><span className="font-bold">💬</span> {entry.customer_notes}</p>
                              </div>
                            )}

                            {/* שולחן ייעודי */}
                            <TablePicker entry={entry} onSave={fetchEntries} />

                            {/* פרס שנבחר */}
                            {entry.selected_treat_id && (
                              <div className="mb-2 bg-[#F4ECD8] border border-purple-200 rounded-xl px-3 py-2">
                                <p className="text-xs font-bold text-[#7A3722]">
                                  🎁 {treats.find(t => t.id === entry.selected_treat_id)?.name || 'פרס'}
                                </p>
                              </div>
                            )}

                            {/* זמן המתנה + זמן מוערך */}
                            <div className="flex items-center gap-2 mb-2">
                              <div className="flex items-center gap-1 text-xs text-gray-400 bg-gray-50 rounded-xl px-2 py-1">
                                <Clock className="w-3 h-3" />
                                <WaitTime timestamp_approved={entry.timestamp_approved} />
                              </div>
                              {editingEstimate === entry.id ? (
                                <div className="flex gap-1 flex-1">
                                  <input
                                    type="number" min="0"
                                    value={estimatedWaitInput[entry.id] || ''}
                                    onChange={(e) => setEstimatedWaitInput(prev => ({ ...prev, [entry.id]: parseInt(e.target.value) || 0 }))}
                                    placeholder="דקות"
                                    className="flex-1 text-xs border border-amber-300 rounded-lg px-2 py-1 focus:outline-none"
                                    autoFocus
                                  />
                                  <button onClick={() => handleSaveEstimatedWait(entry.id, estimatedWaitInput[entry.id])} className="px-2 py-1 text-xs bg-green-500 text-white rounded-lg font-bold">✓</button>
                                  <button onClick={() => { setEditingEstimate(null); setEstimatedWaitInput(prev => { const n = {...prev}; delete n[entry.id]; return n; }); }} className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded-lg font-bold">✕</button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setEditingEstimate(entry.id); setEstimatedWaitInput(prev => ({ ...prev, [entry.id]: entry.estimated_wait_time || 0 })); }}
                                  className={`text-xs px-2.5 py-1 rounded-xl font-bold transition-all ${entry.estimated_wait_time ? 'bg-amber-100 border border-amber-200 text-amber-700' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                                >⏱️ {entry.estimated_wait_time ? `${entry.estimated_wait_time} דק'` : 'הוסף זמן'}</button>
                              )}
                            </div>

                            {/* מונה קריאה למזדמן */}
                            {callCountdowns[entry.id] !== undefined && (
                              <div className={`flex items-center justify-between mb-2 px-3 py-2 rounded-2xl ${
                                callCountdowns[entry.id] === 0 ? 'bg-red-100 animate-pulse' :
                                callCountdowns[entry.id] <= 60 ? 'bg-orange-100' : 'bg-amber-100'
                              }`}>
                                <span className={`font-black text-base ${callCountdowns[entry.id] === 0 ? 'text-red-700' : callCountdowns[entry.id] <= 60 ? 'text-orange-700' : 'text-amber-700'}`}>
                                  {callCountdowns[entry.id] === 0 ? '⏰ לא הגיע!' : `🔔 ${Math.floor(callCountdowns[entry.id]/60)}:${String(callCountdowns[entry.id]%60).padStart(2,'0')}`}
                                </span>
                                <div className="flex gap-1.5">
                                  <button onClick={() => handleSeatAfterCall(entry)} className="px-3 py-1.5 rounded-xl bg-green-500 text-white text-sm font-black active:scale-95 transition-all">✅ ישב</button>
                                  <button onClick={() => handleSkipToNext(entry)} className="px-3 py-1.5 rounded-xl bg-red-400 text-white text-sm font-black active:scale-95 transition-all">⏭ הבא</button>
                                </div>
                              </div>
                            )}

                            {/* כפתורי פעולה — שורה תחתונה */}
                            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                              {/* צד שמאל: פעולות משניות */}
                              <div className="flex gap-2">
                                <button onClick={() => openCustomerHistory(entry.phone)} title="היסטוריה" className="w-10 h-10 rounded-2xl bg-[#F4ECD8] active:bg-purple-200 text-[#7A3722] flex items-center justify-center transition-all">
                                  <History className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleToggleTreat(entry)} title="פינוק" className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all text-lg ${entry.treated ? 'bg-pink-200 text-[#7A3722]' : 'bg-gray-100 active:bg-[#F4ECD8]'}`}>🎁</button>
                                {!bonusAmount[entry.id] ? (
                                  <button onClick={() => setBonusAmount(prev => ({ ...prev, [entry.id]: 100 }))} title="בונוס" className="w-10 h-10 rounded-2xl bg-[#F4ECD8] active:bg-yellow-200 text-yellow-700 flex items-center justify-center transition-all text-lg">⭐</button>
                                ) : (
                                  <div className="flex items-center gap-0.5 bg-[#FAF5E8] px-2 py-1 rounded-xl border border-yellow-200">
                                    <input type="number" min="1" max="999" value={bonusAmount[entry.id]} onChange={(e) => setBonusAmount(prev => ({ ...prev, [entry.id]: parseInt(e.target.value) || 100 }))} className="w-10 text-center text-xs border-0 bg-transparent text-yellow-700 font-black outline-none" />
                                    <button onClick={() => handleGiveBonus(entry)} className="text-xs font-black text-yellow-700">✓</button>
                                    <button onClick={() => setBonusAmount(prev => { const n = {...prev}; delete n[entry.id]; return n; })} className="text-xs font-black text-yellow-500">✕</button>
                                  </div>
                                )}
                                {callCountdowns[entry.id] === undefined && !proxPending && (
                                  <button onClick={() => handleProximityCheck(entry)} title="בדוק קרבה" className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all text-lg ${proxNo ? 'bg-purple-200' : proxYes ? 'bg-green-200' : 'bg-[#F4ECD8] active:bg-[#E8D9B5]'}`}>📍</button>
                                )}
                                {proxPending && <div className="w-10 h-10 rounded-2xl bg-yellow-200 flex items-center justify-center text-lg animate-pulse">📍</div>}
                                {callCountdowns[entry.id] === undefined && (
                                  <button onClick={() => handleCallGuest(entry)} title="קרא למזדמן" className="w-10 h-10 rounded-2xl bg-amber-100 active:bg-amber-200 text-amber-700 flex items-center justify-center transition-all text-lg">🔔</button>
                                )}
                              </div>
                              {/* צד ימין: פעולות ראשיות */}
                              <div className="flex gap-2">
                                <button onClick={() => handleSeat(entry)} title="הושב" className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-green-500 active:bg-green-600 text-white font-black text-sm transition-all shadow-sm active:scale-95">
                                  <Check className="w-4 h-4" /> הושב
                                </button>
                                <button onClick={() => handleAbandon(entry)} title="נטש" className="w-10 h-10 rounded-2xl bg-red-100 active:bg-red-200 text-red-600 flex items-center justify-center transition-all">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        );
                      }}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>

      {/* מודאל אישור עם הזנת זמן */}
      {approvingEntry && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl mb-4">
            <h3 className="text-lg font-black text-gray-800 mb-1">אישור התור</h3>
            <p className="text-gray-600 text-sm mb-4">{approvingEntry.customer_name} • {approvingEntry.party_size} סועדים</p>
            
            <div className="space-y-3">
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-2">⏱️ הזמן המוערך (בדקות)</label>
                <input
                  type="number"
                  min="0"
                  max="999"
                  value={approvalWaitTime}
                  onChange={(e) => setApprovalWaitTime(e.target.value)}
                  placeholder="לדוגמה: 15"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-emerald-400 font-bold text-lg text-center"
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-2">הלקוח יראה את הטיימר בדף שלו והוא יתחיל לספור מעכשיו</p>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={confirmApproval}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm transition-all"
                >
                  ✅ אשר + התחל טיימר
                </button>
                <button
                  onClick={() => { setApprovingEntry(null); setApprovalWaitTime(null); }}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-3 rounded-xl text-sm transition-all"
                >
                  ✕ ביטול
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* מודאל היסטוריה */}
      {historyPhone && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl mb-4 max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-gray-800">היסטוריית תור</h3>
              <button
                onClick={() => { setHistoryPhone(null); setHistoryEntries([]); }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >✕</button>
            </div>

            <p className="text-sm text-gray-600 mb-4">📱 {historyPhone}</p>

            {historyEntries.length === 0 ? (
              <p className="text-gray-400 text-center text-sm">אין היסטוריה</p>
            ) : (
              <div className="space-y-2">
                {historyEntries.map(e => {
                  const waitTime = Math.round((new Date(e.timestamp_end || new Date()) - new Date(e.timestamp_approved || e.timestamp_register)) / 60000);
                  return (
                    <div key={e.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm text-gray-800">{e.customer_name}</span>
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                          e.status === 'seated' ? 'bg-green-100 text-green-700' :
                          e.status === 'abandoned' ? 'bg-red-100 text-red-700' :
                          'bg-[#F4ECD8] text-yellow-700'
                        }`}>
                          {e.status === 'seated' ? '✅ הוּשב' : e.status === 'abandoned' ? '❌ נטש' : '⏳ ממתין'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 space-y-0.5">
                        <p>👥 {e.party_size} סועדים</p>
                        <p>⏱️ זמן המתנה: {waitTime} דק'</p>
                        {e.time_credits_earned > 0 && <p>💰 מטבעות: {e.time_credits_earned}</p>}
                        {e.feedback_rating && <p>⭐ דירוג: {e.feedback_rating}</p>}
                        <p className="text-xs text-gray-400">{new Date(e.timestamp_register).toLocaleDateString('he-IL')}</p>
                      </div>
                      {e.status === 'abandoned' && (
                        <button
                          onClick={async () => {
                            const maxOrder = Math.max(0, ...entries.filter(x => x.status === 'active').map(x => x.sort_order ?? 0));
                            await base44.entities.QueueEntry.update(e.id, {
                              status: 'active',
                              timestamp_end: null,
                              seat_called_at: null,
                              sort_order: maxOrder + 1,
                            });
                            fetchEntries();
                            setHistoryEntries(prev => prev.map(x => x.id === e.id ? { ...x, status: 'active' } : x));
                          }}
                          className="mt-2 w-full bg-[#44512C] hover:bg-[#44512C] text-white text-xs font-black py-2 rounded-lg transition-all active:scale-95"
                        >
                          ↩️ החזר לתור
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}