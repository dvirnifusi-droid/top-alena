import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

// קואורדינטות המסעדה — עדכן לפי המיקום האמיתי של המסעדה
// כדי לקבל קואורדינטות: פתח Google Maps, חפש את המסעדה, לחץ ימני → "מה כאן?"
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

async function registerPushAndSave(entryId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const existing = await reg.pushManager.getSubscription();
    const sub = existing || await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: VAPID_PUBLIC_KEY,
    });

    await base44.entities.QueueEntry.update(entryId, {
      push_subscription: sub.toJSON(),
    });
  } catch (e) {
    console.warn('Push registration failed:', e);
  }
}

const ABANDON_REASONS = [
  { id: 'wait_too_long', label: '⏳ זמן המתנה ארוך מידי' },
  { id: 'no_vibe', label: '🌫️ לא התחברתי לאווירה' },
  { id: 'no_menu', label: '🍽️ לא התחברתי לתפריט' },
  { id: 'other', label: '✏️ אחר — ציין מה' },
];

function QueueJoinInner() {
  const urlParams = new URLSearchParams(window.location.search);
  const entryId = urlParams.get('id');

  const [phase, setPhase] = useState(entryId ? 'waiting' : 'register');
  const [geofencingEnabled, setGeofencingEnabled] = useState(true);
  const [geoStatus, setGeoStatus] = useState('idle'); // idle | checking | denied | too_far | ok
  const [showAbandonModal, setShowAbandonModal] = useState(false);
  const [abandonReason, setAbandonReason] = useState('');
  const [abandonOther, setAbandonOther] = useState('');
  const [abandonLoading, setAbandonLoading] = useState(false);
  const [form, setForm] = useState({ customer_name: '', phone: '', party_size: 2 });
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [entry, setEntry] = useState(null);
  const [queuePosition, setQueuePosition] = useState(null);
  const [estimatedWait, setEstimatedWait] = useState(null);
  const [error, setError] = useState('');
  const [waitMinutes, setWaitMinutes] = useState(0);
  const [callSecondsLeft, setCallSecondsLeft] = useState(null);
  const [timeCreditsEarned, setTimeCreditsEarned] = useState(0);
  const [treats, setTreats] = useState([]);
  const [showTreatModal, setShowTreatModal] = useState(false);
  const [debugLog, setDebugLog] = useState([]);
  const [duplicateEntry, setDuplicateEntry] = useState(null);
  const [isPublicMode] = useState(true); // תמיד בדף ציבורי זה
  const callTimerRef = useRef(null);

  // עדכן את ה-phase כשה-entry משתנה
  useEffect(() => {
    if (!entry) {
      if (entryId) setPhase('waiting'); // entry עדיין טוען
      else setPhase('register'); // אין ID - תצוגת הרשמה
    } else if (entry.status === 'seated' || entry.status === 'abandoned') {
      setPhase('done');
    } else {
      setPhase('waiting'); // pending או active
    }
  }, [entry, entryId]);

  // טעינת הגדרות מסעדה (ללא בדיקת התחברות)
  useEffect(() => {
    if (isPublicMode) {
      base44.entities.RestaurantProfile.list()
        .then(profiles => {
          if (profiles.length > 0) {
            setGeofencingEnabled(profiles[0].geofencing_enabled !== false);
          }
        })
        .catch(() => {}); // שגיאות בטוחות - המשך עם ברירת מחדל
    }
  }, [isPublicMode]);

  // טעינת פינוקים זמינים דרך backend function
  useEffect(() => {
    console.log('🔄 Loading treats...');
    const fetchTreats = async (retryCount = 0) => {
      try {
        const res = await base44.functions.invoke('getTreats', {});
        const t = res.data?.treats || [];
        console.log('✅ Treats loaded:', t.length, 'items');
        setTreats(t);
        setDebugLog(prev => [...prev, `✅ Treats: ${t.length} items`]);
      } catch (e) {
        if (retryCount < 2) {
          console.warn(`⚠️ Retry ${retryCount + 1}/2 for treats...`);
          setTimeout(() => fetchTreats(retryCount + 1), 1000);
        } else {
          console.error('❌ Failed to load treats:', e.message);
          setDebugLog(prev => [...prev, `❌ Treats error: ${e.message}`]);
          setTreats([]); // fallback to empty
        }
      }
    };
    fetchTreats();
  }, []);

  // שידור מיקום כל 30 שניות (רק אם הלקוח פעיל בתור)
  useEffect(() => {
    if (!entryId || !navigator.geolocation) return;
    const sendLocation = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          base44.entities.QueueEntry.update(entryId, {
            last_lat: pos.coords.latitude,
            last_lng: pos.coords.longitude,
            last_location_at: new Date().toISOString(),
          }).catch(() => {});
        },
        () => {},
        { timeout: 5000, maximumAge: 15000, enableHighAccuracy: false }
      );
    };
    sendLocation();
    const interval = setInterval(sendLocation, 30000);
    return () => clearInterval(interval);
  }, [entryId]);

  // Real-time subscription + רענון אוטומטי
  useEffect(() => {
    if (!entryId) return;

    // Subscribe to real-time updates
    const unsubscribe = base44.entities.QueueEntry.subscribe((event) => {
      if (event.id === entryId) {
        // עדכן מיד כשיש שינוי
        setEntry(event.data);
        // phase יתעדכן אוטומטית דרך ה-useEffect של entry
      }
    });

    const fetchStatus = async () => {
      try {
        // קרא דרך backend function עם service role - עובד גם למשתמשים אנונימיים
        const res = await base44.functions.invoke('getQueueEntry', { entryId });
        const found = res.data?.entry || res.entry;
        if (!found) {
          console.warn('Entry not found:', entryId);
          return;
        }
        setEntry(found);
        console.log('Entry fetched:', found.id, 'status:', found.status);

        if (found.status === 'seated' || found.status === 'abandoned') {
          setPhase('done');
          return;
        }

        // קבל מיקום בתור דרך backend function
        try {
          console.log('🔄 Fetching queue position for entry:', entryId);
          const res = await base44.functions.invoke('getQueuePosition', { entryId });
          if (res.data?.position) {
            console.log('✅ Queue position:', res.data.position, res.data.status);
            setQueuePosition(res.data.position);
            setDebugLog(prev => [...prev, `✅ Queue pos (${res.data.status}): ${res.data.position}/${res.data.total}`]);
          } else {
            console.log('⚠️ Not in queue');
            setQueuePosition(null);
            setDebugLog(prev => [...prev, `⚠️ Not in queue`]);
          }
        } catch (e) {
          console.error('❌ Error fetching queue position:', e.message);
          setDebugLog(prev => [...prev, `❌ Position error: ${e.message}`]);
          setQueuePosition(null);
        }
        setEstimatedWait(null);

        // זמן המתנה מצטבר
        if (found.timestamp_approved) {
          setWaitMinutes(Math.round((Date.now() - new Date(found.timestamp_approved).getTime()) / 60000));
        }

        // טיימר קריאה למזדמן
        if (found.seat_called_at) {
          const elapsed = Math.floor((Date.now() - new Date(found.seat_called_at).getTime()) / 1000);
          const left = Math.max(0, 180 - elapsed);
          setCallSecondsLeft(left);
          // הפעל טיימר חי אם עדיין רץ
          if (callTimerRef.current) clearInterval(callTimerRef.current);
          if (left > 0) {
            callTimerRef.current = setInterval(() => {
              setCallSecondsLeft(prev => {
                if (prev <= 1) { clearInterval(callTimerRef.current); return 0; }
                return prev - 1;
              });
            }, 1000);
          }
        } else {
          setCallSecondsLeft(null);
          if (callTimerRef.current) clearInterval(callTimerRef.current);
        }
      } catch (e) {
        console.error('Error fetching queue status:', e);
      }
    };

    fetchStatus(); // רענן מיד בטעינה
    const interval = setInterval(fetchStatus, 5000); // רענן כל 5 שניות
    return () => {
      clearInterval(interval);
      unsubscribe();
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [entryId]);

  // טיק-טוק עדכון זמן מצטבר בלייב + צבירת מטבעות (7 מטבעות לדקה)
  useEffect(() => {
    if (!entry?.timestamp_approved) return;
    const tick = setInterval(() => {
      const waitMin = Math.round((Date.now() - new Date(entry.timestamp_approved).getTime()) / 60000);
      setWaitMinutes(waitMin);
      // צביר 7 מטבעות לכל דקת המתנה
      const calculatedCredits = Math.floor(waitMin * 7);
      setTimeCreditsEarned(Math.max(entry.time_credits_earned || 0, calculatedCredits));
    }, 3000);
    return () => clearInterval(tick);
  }, [entry?.timestamp_approved, entry?.time_credits_earned]);

  const checkGeoAndRegister = async () => {
    if (!form.customer_name.trim() || !form.phone.trim()) {
      setError('נא למלא שם ומספר טלפון');
      return;
    }
    setError('');
    setLoading(true);

    try {
      // בדוק אם יש כניסה עם אותו מספר טלפון
      let existing = [];
      try {
        existing = await base44.entities.QueueEntry.filter({ phone: form.phone.trim() });
      } catch (e) {
        console.warn('Cannot check existing entries:', e);
      }
      const activeEntry = existing.find(e => e.status !== 'seated' && e.status !== 'abandoned');
      if (activeEntry) {
        setDuplicateEntry(activeEntry);
        setLoading(false);
        return;
      }

      // טען את geofencingEnabled עדכני מה-DB (אם יש service role)
      let isGeoEnabled = false; // ברירת מחדל: כבוי
      try {
        const profiles = await base44.asServiceRole.entities.RestaurantProfile.list();
        console.log('Profiles from DB:', profiles);
        if (profiles.length > 0) {
          isGeoEnabled = profiles[0].geofencing_enabled !== false;
          console.log('geofencing_enabled value:', profiles[0].geofencing_enabled, 'isGeoEnabled:', isGeoEnabled);
        } else {
          console.log('No profiles found, geofencing disabled by default');
        }
      } catch (e) {
        console.error('Cannot check geofencing status:', e);
        isGeoEnabled = false; // אם יש error, כבה את המיקום
      }
      
      console.log('Final isGeoEnabled:', isGeoEnabled);
      console.log('navigator.geolocation available:', !!navigator.geolocation);
      
      // אם גיאופנסינג כבוי או אין תמיכה בmGeolocation, הנח מיד
      if (!isGeoEnabled || !navigator.geolocation) {
        console.log('Skipping geofencing - bypassing to registration');
        await performRegister();
        return;
      }

      // אם גיאופנסינג פעיל, בדוק מיקום
      console.log('Starting geolocation check...');
      setGeoStatus('checking');
      
      // timeout של 5 שניות - אם לא קיבלנו תשובה, חסום את הרישום
      let timeoutCleared = false;
      const geoTimeout = setTimeout(() => {
        if (!timeoutCleared) {
          timeoutCleared = true;
          console.log('Geolocation timeout - blocking registration');
          setGeoStatus('denied');
          setError('לא הצלחנו לאמת את מיקומך. אנא אשר גישה למיקום וסדר אחד.');
          setLoading(false);
        }
      }, 5000);
      
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (timeoutCleared) return;
          timeoutCleared = true;
          clearTimeout(geoTimeout);
          const dist = calcDistance(pos.coords.latitude, pos.coords.longitude, RESTAURANT_LAT, RESTAURANT_LNG);
          console.log('Distance:', dist, 'meters');
          if (dist <= MAX_DISTANCE_METERS) {
            console.log('✅ User is within range - approving');
            setGeoStatus('ok');
            performRegister();
          } else {
            console.log('❌ User is too far - rejecting');
            setGeoStatus('too_far');
            setError('אופס! נראה שאתם רחוקים מדי. הרישום לתור מתאפשר רק מהמסעדה עצמה.');
            setLoading(false);
          }
        },
        (err) => {
          if (timeoutCleared) return;
          timeoutCleared = true;
          clearTimeout(geoTimeout);
          console.log('Geolocation error:', err.code, err.message);
          setGeoStatus('denied');
          setError('לא הצלחנו לאמת את מיקומך. אנא אשר גישה למיקום וסדר אחד.');
          setLoading(false);
        },
        { timeout: 4000, maximumAge: 0, enableHighAccuracy: false }
      );
    } catch (e) {
      console.error('Error in checkGeoAndRegister:', e);
      setError('שגיאה בהרשמה: ' + (e.message || 'נסה שוב'));
      setGeoStatus('idle');
      setLoading(false);
    }
  };

  const performRegister = async () => {
    setGeoStatus('idle');
    setLoading(true);
    setError('');

    try {
      const res = await base44.functions.invoke('createQueueEntry', {
        customer_name: form.customer_name.trim(),
        phone: form.phone.trim(),
        party_size: parseInt(form.party_size),
      });
      console.log('Response from createQueueEntry:', res);
      
      if (res.error || !res.data?.entry) {
        throw new Error(res.error || 'שגיאה בהרשמה - נסה שוב');
      }
      
      const newEntry = res.data.entry;
      console.log('New entry:', newEntry);

      if (!newEntry || !newEntry.id) {
        throw new Error('לא קיבלנו ID - תשובה לא תקינה מהשרת');
      }

      registerPushAndSave(newEntry.id).catch(() => {});
      console.log('Redirecting to:', `/QueueJoin?id=${newEntry.id}`);
      window.location.href = `/QueueJoin?id=${newEntry.id}`;
    } catch (e) {
      console.error('Registration error:', e);
      setError('שגיאה בהרשמה: ' + (e.message || 'נסה שוב'));
      setLoading(false);
    }
  };



  // דף כניסה לתור קיים
  if (duplicateEntry) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)' }} dir="rtl">
        <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 w-full max-w-sm text-center border border-white/20">
          <div className="text-5xl mb-4">👋</div>
          <h2 className="text-2xl font-black text-slate-800 mb-2">ברוכים שוב הבאים!</h2>
          <p className="text-slate-600 text-sm mb-6">יש לך כבר כניסה פעילה בתור</p>
          <button
            onClick={() => window.location.href = `/QueueJoin?id=${duplicateEntry.id}`}
            className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black py-3.5 rounded-2xl text-base transition-all shadow-lg"
          >
            ↩️ חזור לתור שלי
          </button>
          <button
            onClick={() => setDuplicateEntry(null)}
            className="w-full text-slate-400 text-sm mt-4 hover:text-slate-600 transition-colors"
          >
            ← רוצה להרשם מחדש
          </button>
        </div>
      </div>
    );
  }

  // ========== דף הרשמה ==========
  if (phase === 'register') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)' }} dir="rtl">
        {/* לוגו */}
        <div className="text-center mb-10">
          <div className="text-7xl mb-4 drop-shadow-lg">🍽️</div>
          <h1 className="text-4xl font-black text-white tracking-wider">עלינא</h1>
          <p className="text-slate-300 text-sm mt-2 font-light">ברוכים הבאים לחוויה קולינרית עדינה</p>
        </div>

        {/* כרטיסית */}
        <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 w-full max-w-sm border border-white/20">
          <h2 className="text-2xl font-black text-slate-800 mb-6 text-center">הצטרפות לתור</h2>

          <div className="space-y-5">
            {/* שם */}
            <div>
              <label className="text-sm font-bold text-slate-700 block mb-2">👤 שם מלא</label>
              <input
                className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-base focus:outline-none focus:border-slate-800 focus:shadow-md transition-all"
                placeholder="הכנס את שמך המלא"
                value={form.customer_name}
                onChange={e => setForm({ ...form, customer_name: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && checkGeoAndRegister()}
              />
            </div>

            {/* טלפון */}
            <div>
              <label className="text-sm font-bold text-slate-700 block mb-2">📱 מספר טלפון</label>
              <input
                className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-base focus:outline-none focus:border-slate-800 focus:shadow-md transition-all"
                placeholder="050-0000000"
                type="tel"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && checkGeoAndRegister()}
              />
            </div>

            {/* כמות סועדים */}
            <div>
              <label className="text-sm font-bold text-slate-700 block mb-2">🍴 כמות סועדים</label>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                  <button
                    key={n}
                    onClick={() => setForm({ ...form, party_size: n })}
                    className={`py-3 rounded-xl font-bold text-lg transition-all ${
                      form.party_size === n
                        ? 'bg-slate-800 text-white shadow-lg scale-105'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {n === 8 ? '8+' : n}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                <p className="text-red-600 text-sm font-medium">⚠️ {error}</p>
              </div>
            )}

            {/* מסך בדיקת מיקום */}
            {geoStatus === 'checking' && (
              <div className="bg-slate-100 border border-slate-300 rounded-2xl p-4 text-center">
                <div className="flex items-center justify-center gap-2 text-slate-700">
                  <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  <span className="font-bold text-sm">מאמת מיקום...</span>
                </div>
              </div>
            )}

            {/* רחוק מדי */}
            {geoStatus === 'too_far' && (
              <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-5 text-center">
                <div className="text-4xl mb-2">📍</div>
                <p className="font-black text-red-700 text-base mb-1">אתם רחוקים מהמסעדה</p>
                <p className="text-red-500 text-sm mb-4">הרשמה אפשרית רק בקרבת המסעדה</p>
                <button
                  onClick={() => setGeoStatus('idle')}
                  className="text-sm text-red-600 font-bold hover:text-red-700"
                >
                  נסה שוב
                </button>
              </div>
            )}

            {geoStatus !== 'too_far' && (
              <button
                onClick={checkGeoAndRegister}
                disabled={loading || geoStatus === 'checking'}
                className="w-full bg-slate-800 hover:bg-slate-900 active:scale-95 text-white font-black py-4 rounded-2xl text-lg transition-all disabled:opacity-50 shadow-xl mt-2"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    מצטרף...
                  </span>
                ) : '✨ הצטרף לתור'}
              </button>
            )}
          </div>
        </div>

        <p className="text-slate-400 text-xs mt-8 font-light">מסעדת עלינא © 2026</p>
      </div>
    );
  }

  // ========== דף סיום ==========
  if (phase === 'done') {
    const isSeated = entry?.status === 'seated';
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)' }} dir="rtl">
        <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-10 w-full max-w-sm text-center border border-white/20">
          <div className="text-7xl mb-4 animate-bounce">{isSeated ? '🎉' : '👋'}</div>
          <h2 className="text-2xl font-black text-gray-800 mb-3">
            {isSeated ? 'בתיאבון!' : 'להתראות!'}
          </h2>
          <p className="text-gray-500 leading-relaxed">
            {isSeated
              ? 'שולחן מוכן בשבילכם! תהנו מארוחה נפלאה במסעדת עלינא 🍽️'
              : 'תודה שביקרתם. נשמח לראותכם שוב בקרוב! 💚'}
          </p>
          {isSeated && (
            <div className="mt-6 bg-emerald-50 rounded-2xl p-4 border border-emerald-200">
              <p className="text-emerald-700 font-bold text-sm">הצוות שלנו ממתין לכם 🌟</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ========== דף המתנה ==========
  const isPending = entry?.status === 'pending';
  const isActive = entry?.status === 'active';
  const showProximityBanner = entry?.proximity_response === 'pending' && entry?.proximity_check_at;

  const handleProximityResponse = async (answer) => {
    setActionLoading(true);
    try {
      if (answer === 'no') {
        await base44.entities.QueueEntry.update(entryId, {
          status: 'abandoned',
          proximity_response: 'no',
          timestamp_end: new Date().toISOString(),
          notes: 'לא בסביבה — בדיקת קרבה',
        });
        setEntry(prev => ({ ...prev, status: 'abandoned', proximity_response: 'no' }));
      } else {
        await base44.entities.QueueEntry.update(entryId, {
          proximity_response: 'yes',
        });
        setEntry(prev => ({ ...prev, proximity_response: 'yes' }));
      }
    } catch (e) {
      console.error('Error:', e);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start pt-8 p-4" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)' }} dir="rtl">
    {/* לוגו */}
    <div className="text-center mb-8">
      <div className="text-5xl mb-2 drop-shadow-lg">🍽️</div>
      <h1 className="text-3xl font-black text-white">עלינא</h1>
      <p className="text-slate-300 text-xs mt-1 font-light">קו אישי לתור</p>
    </div>

    {/* כרטיס ראשי */}
    <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-white/20">

    {/* כותרת */}
    <div className={`p-6 text-white text-center ${
      entry?.proximity_response === 'yes' ? 'bg-green-600' : 
      entry?.proximity_response === 'no' ? 'bg-purple-600' :
      isPending ? 'bg-amber-600' : 'bg-slate-800'
    }`}>
        <p className="font-black text-2xl">{entry?.customer_name || ''}</p>
        <p className="text-sm opacity-80 mt-1">{entry?.party_size} סועדים</p>
        {entry?.proximity_response === 'yes' && <p className="text-xs mt-1">✅ בסביבה</p>}
        {entry?.proximity_response === 'no' && <p className="text-xs mt-1">❌ נטש</p>}
      </div>

        <div className="p-6 space-y-4">

          {/* מקום בתור + פרסים */}
          {isActive && (
            <>
              {/* מקום בתור */}
              {queuePosition != null && (
                <div className="bg-blue-50 border-2 border-blue-300 rounded-2xl p-4 text-center mb-4">
                  <p className="text-blue-800 font-black text-5xl">{queuePosition}</p>
                  <p className="text-blue-600 text-sm mt-2 font-bold">מקום בתור</p>
                </div>
              )}

              {/* פרסים זמינים */}
              {treats.length > 0 && (
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-2xl p-4">
                  <p className="font-black text-purple-800 text-sm mb-3 text-center">🎁 פרסים שאתה יכול להרוויח</p>
                  <div className="space-y-2">
                    {treats.map(treat => (
                      <div key={treat.id} className="bg-white rounded-xl p-3 flex items-center justify-between border border-purple-100">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-gray-800">{treat.emoji} {treat.name}</p>
                          <p className="text-xs text-gray-500">{treat.description}</p>
                        </div>
                        <div className="text-right ml-3 flex-shrink-0">
                          <p className={`font-black text-sm ${timeCreditsEarned >= treat.cost ? 'text-purple-700' : 'text-gray-400'}`}>
                            {treat.cost} 💰
                          </p>
                          {timeCreditsEarned >= treat.cost && (
                            <span className="text-xs text-green-600 font-bold">✅ זמין!</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-purple-600 text-center mt-3">
                    💡 צבור עוד {treats.length > 0 ? Math.max(0, treats[0].cost - timeCreditsEarned) : 0} מטבעות להפוך לאפשרי
                  </p>
                </div>
              )}
            </>
          )}

          {/* באנר בדיקת קרבה */}
          {showProximityBanner && (
            <div className="bg-blue-50 border-2 border-blue-400 rounded-2xl p-5 text-center animate-pulse">
              <div className="text-4xl mb-2">📍</div>
              <p className="font-black text-blue-800 text-lg mb-1">המארחת שואלת:</p>
              <p className="text-blue-600 text-base mb-4">האם אתם בסביבת המסעדה?</p>
              <div className="flex gap-3">
               <button
                 onClick={async () => {
                   setEntry(prev => ({ ...prev, proximity_response: 'yes' }));
                   try {
                     await base44.functions.invoke('updateProximityResponse', { entryId, response: 'yes' });
                   } catch (e) {
                     console.error('Error:', e);
                   }
                 }}
                 disabled={actionLoading}
                 className="flex-1 bg-green-500 hover:bg-green-600 active:scale-95 disabled:opacity-50 text-white font-black py-3.5 rounded-2xl text-lg transition-all shadow"
               >
                 ✅ כן, אני כאן!
               </button>
               <button
                 onClick={async () => {
                   setEntry(prev => ({ ...prev, status: 'abandoned', proximity_response: 'no', timestamp_end: new Date().toISOString() }));
                   try {
                     await base44.functions.invoke('updateProximityResponse', { entryId, response: 'no' });
                   } catch (e) {
                     console.error('Error:', e);
                   }
                 }}
                 disabled={actionLoading}
                 className="flex-1 bg-red-400 hover:bg-red-500 active:scale-95 disabled:opacity-50 text-white font-black py-3.5 rounded-2xl text-lg transition-all shadow"
               >
                 ❌ לא, הולך
               </button>
              </div>
            </div>
          )}

          {/* סטטוס - ממתין לאישור */}
          {isPending && (
            <div className="bg-gradient-to-b from-yellow-50 to-amber-50 border-2 border-yellow-300 rounded-2xl p-5 text-center">
              <div className="text-5xl mb-3">⏳</div>
              <p className="font-black text-amber-800 text-2xl mb-2">המארחת בודקת אתכם</p>
              <p className="text-amber-700 text-base leading-relaxed">המארחת תאשר את נוכחותך בקרוב<br/><span className="text-sm">בקשה זו בדרך כלל מאושרת תוך דקה אחת</span></p>
            </div>
          )}

          {/* טיימר קריאה למזדמן */}
          {isActive && callSecondsLeft !== null && (
            <div className={`rounded-2xl p-5 text-center border-2 ${
              callSecondsLeft === 0
                ? 'bg-red-50 border-red-400 animate-pulse'
                : callSecondsLeft <= 60
                ? 'bg-orange-50 border-orange-400'
                : 'bg-green-50 border-green-400'
            }`}>
              <div className="text-4xl mb-2">{callSecondsLeft === 0 ? '❌' : '🔔'}</div>
              <p className={`font-black text-xl mb-1 ${
                callSecondsLeft === 0 ? 'text-red-700' : callSecondsLeft <= 60 ? 'text-orange-700' : 'text-green-700'
              }`}>
                {callSecondsLeft === 0 ? 'הזמן עבר!' : 'השולחן שלכם מוכן!'}
              </p>
              {callSecondsLeft > 0 && (
                <>
                  <p className={`text-5xl font-black mb-2 ${callSecondsLeft <= 60 ? 'text-orange-600' : 'text-green-600'}`}>
                    {Math.floor(callSecondsLeft / 60)}:{String(callSecondsLeft % 60).padStart(2, '0')}
                  </p>
                  <p className="text-sm text-gray-500 mb-4">גשו למארחת — יש לכם {Math.ceil(callSecondsLeft / 60)} דקות!</p>
                  <button
                   onClick={async () => {
                     try {
                       await base44.functions.invoke('seatGuest', { entryId });
                       setPhase('done');
                     } catch (e) {
                       console.error('Error seating:', e);
                     }
                   }}
                   disabled={actionLoading}
                   className="w-full bg-green-500 hover:bg-green-600 active:scale-95 disabled:opacity-50 text-white font-black py-4 rounded-2xl text-xl transition-all shadow-lg"
                  >
                   ✅ הגעתי למארחת!
                  </button>
                </>
              )}
              {callSecondsLeft === 0 && (
                <p className="text-red-600 text-sm font-medium">הצוות עבר ללקוח הבא 😔</p>
              )}
            </div>
          )}

          {isActive && (
            <>
              {/* הודעת קבלת פנים */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                <p className="text-emerald-800 text-sm leading-relaxed font-medium text-center">
                  🌟 איזה כיף שבאתם אלינו!<br/>
                  <span className="text-xs text-emerald-600 font-normal">
                    אנו מתייחסים בתור רק לאנשים הנמצאים כאן.
                    במידה ותעזבו, המארחת תסיר אתכם מהרשימה.
                  </span>
                </p>
              </div>



              {queuePosition === 1 && (
                <div className="bg-green-50 border-2 border-green-400 rounded-2xl p-3 text-center animate-pulse">
                  <p className="text-green-700 font-black">🎯 אתם הבאים בתור!</p>
                </div>
              )}

              {/* זמן המתנה מצטבר + צבירת מטבעות */}
              {entry?.timestamp_approved && (
                <div className="text-center space-y-2">
                  <p className="text-gray-400 text-xs">ממתינים {waitMinutes} דקות</p>
                  <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-2xl p-3">
                    <p className="text-3xl font-black text-yellow-600 mb-1">💰 {timeCreditsEarned}</p>
                    <p className="text-xs text-yellow-700">מטבעות עלינא שצברת</p>
                    {treats.length > 0 && (
                      <button
                        onClick={() => setShowTreatModal(true)}
                        className="mt-2 w-full text-xs font-bold bg-yellow-500 hover:bg-yellow-600 text-white py-2 rounded-xl transition-all"
                      >
                        🎁 בחר פינוק
                      </button>
                    )}
                  </div>
                  
                  {/* הצגת הפרס שנבחר */}
                  {entry?.selected_treat_id && (
                    <div className="bg-purple-100 border-2 border-purple-400 rounded-2xl p-3 animate-pulse">
                      <p className="text-xs text-purple-700 font-bold mb-1">✅ פרס שלך מחכה:</p>
                      <p className="text-lg font-black text-purple-800">
                        {treats.find(t => t.id === entry.selected_treat_id)?.emoji} {treats.find(t => t.id === entry.selected_treat_id)?.name}
                      </p>
                      <p className="text-xs text-purple-600 mt-1">{treats.find(t => t.id === entry.selected_treat_id)?.description}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}



          {/* רענון אוטומטי */}
          <div className="text-center pt-2">
            <p className="text-gray-300 text-xs">📡 מתרענן אוטומטית כל 10 שניות</p>
          </div>

          {/* כפתור משחק */}
          {isActive && callSecondsLeft === null && (
            <div className="text-center pt-1">
              <a
                href={`/QueueGame?entry=${entryId}&name=${encodeURIComponent(entry?.customer_name || 'אורח')}`}
                className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 active:scale-95 text-white font-black py-3.5 rounded-2xl text-base transition-all shadow-lg"
              >
                🎮 משחקים בזמן ההמתנה
              </a>
              <p className="text-slate-400 text-xs mt-1.5 font-light">טריוויה · תוצאות בזמן אמת</p>
            </div>
          )}

          {/* כפתור ויתרתי */}
          {!callSecondsLeft && <div className="border-t border-gray-100 pt-4">
           <button
             onClick={() => setShowAbandonModal(true)}
             className="w-full border-2 border-red-200 text-red-400 hover:bg-red-50 hover:border-red-300 hover:text-red-500 transition-all rounded-2xl py-3 text-sm font-semibold"
           >
             😔 ויתרתי על התור
           </button>
          </div>}
        </div>
      </div>

      {/* מודאל בחירת פינוק */}
      {showTreatModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl mb-4">
            <h3 className="text-lg font-black text-gray-800 mb-1 text-center">🎁 בחר את הפינוק שלך</h3>
            <p className="text-gray-400 text-sm text-center mb-4">יש לך {timeCreditsEarned} מטבעות</p>

            <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
              {treats.map(treat => (
                <button
                  key={treat.id}
                  onClick={async () => {
                    if (timeCreditsEarned >= treat.cost) {
                      try {
                        const res = await base44.functions.invoke('selectTreat', { entryId, treatId: treat.id, treatCost: treat.cost });
                        setTimeCreditsEarned(res.data?.remainingCredits || 0);
                        setShowTreatModal(false);
                        setEntry(prev => ({ ...prev, selected_treat_id: treat.id, time_credits_earned: res.data?.remainingCredits }));
                      } catch (e) {
                        console.error('Error:', e);
                      }
                    }
                  }}
                  disabled={timeCreditsEarned < treat.cost}
                  className={`w-full text-right px-4 py-4 rounded-2xl border-2 font-bold text-base transition-all flex items-center justify-between ${
                    timeCreditsEarned >= treat.cost
                      ? 'border-green-300 bg-green-50 text-gray-800 hover:bg-green-100'
                      : 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <span className="text-xs text-gray-500">{treat.cost} 💰</span>
                  <div className="text-center flex-1">
                    <p className="text-sm font-black">{treat.emoji} {treat.name}</p>
                    <p className="text-xs text-gray-500">{treat.description}</p>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowTreatModal(false)}
              className="w-full text-gray-400 text-sm py-2 hover:text-gray-600 transition-colors"
            >
              ← חזור
            </button>
          </div>
        </div>
      )}

      {/* מודאל נטישה */}
      {showAbandonModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl mb-4">
            <h3 className="text-lg font-black text-gray-800 mb-1 text-center">עוזבים אותנו? 😢</h3>
            <p className="text-gray-400 text-sm text-center mb-5">ספרו לנו למה — נשתפר בשבילכם</p>

            <div className="space-y-2 mb-4">
              {ABANDON_REASONS.map(r => (
                <button
                  key={r.id}
                  onClick={() => setAbandonReason(r.id)}
                  className={`w-full text-right px-4 py-3 rounded-2xl border-2 font-medium text-sm transition-all ${
                    abandonReason === r.id
                      ? 'border-red-400 bg-red-50 text-red-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {abandonReason === 'other' && (
              <textarea
                className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-red-300 resize-none mb-4"
                rows={2}
                placeholder="ספר לנו מה..."
                value={abandonOther}
                onChange={e => setAbandonOther(e.target.value)}
              />
            )}

            <button
              disabled={!abandonReason || abandonLoading}
              onClick={async () => {
                setAbandonLoading(true);
                const reason = abandonReason === 'other'
                  ? `אחר: ${abandonOther}`
                  : ABANDON_REASONS.find(r => r.id === abandonReason)?.label;
                await base44.entities.QueueEntry.update(entryId, {
                  status: 'abandoned',
                  timestamp_end: new Date().toISOString(),
                  notes: reason,
                });
                setAbandonLoading(false);
                setShowAbandonModal(false);
                setPhase('done');
              }}
              className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white font-black py-3.5 rounded-2xl text-base transition-all"
            >
              {abandonLoading ? 'שומר...' : 'אישור — עוזב את התור'}
            </button>

            <button
              onClick={() => { setShowAbandonModal(false); setAbandonReason(''); setAbandonOther(''); }}
              className="w-full text-gray-400 text-sm mt-3 py-2 hover:text-gray-600 transition-colors"
            >
              ← בעצם נשאר 😊
            </button>
          </div>
        </div>
      )}

      <p className="text-slate-400 text-xs mt-8 font-light">מסעדת עלינא © 2026</p>
    </div>
  );
}

export default function QueueJoin() {
  return <QueueJoinInner />;
}