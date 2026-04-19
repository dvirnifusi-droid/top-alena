import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { invokePublic } from '@/lib/publicFetch';

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

// ===== Accessibility Widget =====
function AccessibilityWidget() {
  const [open, setOpen] = React.useState(false);
  const [fontSize, setFontSize] = React.useState(100); // percent
  const [highContrast, setHighContrast] = React.useState(false);
  const dialogRef = React.useRef(null);

  // Focus trap inside dialog
  React.useEffect(() => {
    if (open && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [open]);

  // Apply font size & contrast to root
  React.useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}%`;
    if (highContrast) {
      document.documentElement.setAttribute('data-high-contrast', 'true');
    } else {
      document.documentElement.removeAttribute('data-high-contrast');
    }
    return () => {
      document.documentElement.style.fontSize = '';
      document.documentElement.removeAttribute('data-high-contrast');
    };
  }, [fontSize, highContrast]);

  return (
    <>
      {/* High contrast global style */}
      {highContrast && (
        <style>{`
          [data-high-contrast="true"] * {
            background-color: #000 !important;
            color: #fff !important;
            border-color: #fff !important;
          }
          [data-high-contrast="true"] button, [data-high-contrast="true"] a {
            background-color: #000 !important;
            color: #ffff00 !important;
            border: 2px solid #ffff00 !important;
          }
        `}</style>
      )}

      {/* Accessibility button */}
      <button
        onClick={() => setOpen(true)}
        aria-label="פתח תפריט נגישות"
        aria-haspopup="dialog"
        title="נגישות"
        style={{
          position: 'fixed',
          bottom: '80px',
          left: '16px',
          zIndex: 9999,
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          background: '#1a5fb4',
          color: '#fff',
          border: '3px solid #fff',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: '1.4rem',
        }}
      >
        <span aria-hidden="true">♿</span>
      </button>

      {/* Accessibility dialog */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="a11y-dialog-title"
          dir="rtl"
          ref={dialogRef}
          tabIndex={-1}
          onKeyDown={e => e.key === 'Escape' && setOpen(false)}
          style={{
            position: 'fixed',
            bottom: '140px',
            left: '16px',
            zIndex: 10000,
            background: '#fff',
            border: '2px solid #1a5fb4',
            borderRadius: '16px',
            padding: '20px',
            width: '240px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            color: '#1a1a1a',
          }}
        >
          <h2 id="a11y-dialog-title" style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '16px', margin: '0 0 16px' }}>
            🛠️ הגדרות נגישות
          </h2>

          {/* Font size */}
          <fieldset style={{ border: 'none', padding: 0, margin: '0 0 12px' }}>
            <legend style={{ fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '6px' }}>גודל טקסט</legend>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setFontSize(f => Math.max(80, f - 10))}
                aria-label="הקטן גופן"
                style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem', background: '#f5f5f5' }}
              >A-</button>
              <button
                onClick={() => setFontSize(100)}
                aria-label="אפס גופן לגודל רגיל"
                style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem', background: '#f5f5f5' }}
              >רגיל</button>
              <button
                onClick={() => setFontSize(f => Math.min(150, f + 10))}
                aria-label="הגדל גופן"
                style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', background: '#f5f5f5' }}
              >A+</button>
            </div>
          </fieldset>

          {/* High contrast */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <label htmlFor="high-contrast-toggle" style={{ fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer' }}>
              ניגודיות גבוהה
            </label>
            <button
              id="high-contrast-toggle"
              role="switch"
              aria-checked={highContrast}
              onClick={() => setHighContrast(v => !v)}
              aria-label={highContrast ? 'כבה ניגודיות גבוהה' : 'הפעל ניגודיות גבוהה'}
              style={{
                width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                background: highContrast ? '#1a5fb4' : '#ccc',
                position: 'relative', transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute', top: '3px',
                right: highContrast ? '3px' : 'auto',
                left: highContrast ? 'auto' : '3px',
                width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'all 0.2s'
              }} aria-hidden="true" />
            </button>
          </div>

          {/* Accessibility statement link */}
          <a
            href="/AccessibilityStatement"
            style={{ display: 'block', textAlign: 'center', color: '#1a5fb4', textDecoration: 'underline', fontSize: '0.82rem', marginBottom: '12px' }}
            aria-label="עבור להצהרת הנגישות של עלינא"
          >
            📄 הצהרת נגישות
          </a>

          <button
            onClick={() => setOpen(false)}
            aria-label="סגור תפריט נגישות"
            style={{
              width: '100%', padding: '8px', background: '#1a5fb4', color: '#fff',
              border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem'
            }}
          >
            סגור ✕
          </button>
        </div>
      )}
    </>
  );
}

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
  const [form, setForm] = useState({ customer_name: '', phone: '', party_size: 2, seating_preference: 'no_preference' });
  const [termsAccepted, setTermsAccepted] = useState(false);
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
  const [customerHistory, setCustomerHistory] = useState(null);
  const [existingEntry, setExistingEntry] = useState(null);
  const [showQueueList, setShowQueueList] = useState(false);
  const [allQueueEntries, setAllQueueEntries] = useState([]);
  const historyTimeoutRef = useRef(null);
  const callTimerRef = useRef(null);

  // טען את רשימת כל הממתינים כשמודאל נפתח
  useEffect(() => {
    if (showQueueList) {
      base44.entities.QueueEntry.filter({ status: 'pending' }, '-timestamp_register', 100)
        .then(entries => setAllQueueEntries(entries))
        .catch(() => setAllQueueEntries([]));
    }
  }, [showQueueList]);

  const handleDeleteEntry = async (id) => {
    if (window.confirm('בטוח להסיר את ההרשמה?')) {
      try {
        await base44.entities.QueueEntry.delete(id);
        setAllQueueEntries(prev => prev.filter(e => e.id !== id));
      } catch (e) {
        console.error('Error:', e);
      }
    }
  };

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
        const res = await invokePublic('getTreats', {});
        const t = res?.treats || [];
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
        const res = await invokePublic('getQueueEntry', { entryId });
        const found = res?.entry;
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
          const res = await invokePublic('getQueuePosition', { entryId });
          if (res?.position) {
            console.log('✅ Queue position:', res.position, res.status);
            setQueuePosition(res.position);
            setDebugLog(prev => [...prev, `✅ Queue pos (${res.status}): ${res.position}/${res.total}`]);
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

  // טיק-טוק עדכון זמן מצטבר בלייב + צבירת מטבעות (7 מטבעות לדקה) - עד שיושב
  useEffect(() => {
    if (!entry?.timestamp_approved || entry.status === 'seated') return;
    const tick = setInterval(() => {
      const waitMin = Math.round((Date.now() - new Date(entry.timestamp_approved).getTime()) / 60000);
      setWaitMinutes(waitMin);
      // צביר 7 מטבעות לכל דקת המתנה - רק אם לא יושב
      if (entry.status !== 'seated') {
        const calculatedCredits = Math.floor(waitMin * 7);
        setTimeCreditsEarned(Math.max(entry.time_credits_earned || 0, calculatedCredits));
      }
    }, 3000);
    return () => clearInterval(tick);
  }, [entry?.timestamp_approved, entry?.status, entry?.time_credits_earned]);

  // טען היסטוריה אוטומטית כשהטלפון משתנה (debounce)
  useEffect(() => {
    if (!form.phone.trim()) {
      setCustomerHistory(null);
      setExistingEntry(null);
      return;
    }

    if (historyTimeoutRef.current) clearTimeout(historyTimeoutRef.current);
    
    historyTimeoutRef.current = setTimeout(async () => {
      try {
        // קריאה אחת ל-backend — מחזירה גם היסטוריה וגם כניסה פעילה
        const histRes = await invokePublic('getAnonymousCustomerHistory', { phone: form.phone.trim() });
        if (histRes?.activeEntryId) {
          const entryRes = await invokePublic('getQueueEntry', { entryId: histRes.activeEntryId });
          setExistingEntry(entryRes?.entry || null);
        } else {
          setExistingEntry(null);
        }
        if (histRes && !histRes.isNewCustomer) {
          setCustomerHistory(histRes);
        } else {
          setCustomerHistory(null);
        }
      } catch (e) {
        console.warn('Could not fetch data:', e);
        setCustomerHistory(null);
        setExistingEntry(null);
      }
    }, 500);

    return () => {
      if (historyTimeoutRef.current) clearTimeout(historyTimeoutRef.current);
    };
  }, [form.phone]);

  const checkGeoAndRegister = async () => {
    if (!form.customer_name.trim() || !form.phone.trim()) {
      setError('נא למלא שם ומספר טלפון');
      return;
    }
    if (!termsAccepted) {
      setError('יש לאשר את תקנון השימוש ומדיניות הפרטיות כדי להמשיך');
      return;
    }
    setError('');
    setLoading(true);

    try {
      // בדוק אם יש כניסה פעילה — דרך backend function בלבד
      try {
        const checkRes = await invokePublic('getAnonymousCustomerHistory', { phone: form.phone.trim() });
        if (checkRes?.activeEntryId) {
          const entryRes = await invokePublic('getQueueEntry', { entryId: checkRes.activeEntryId });
          if (entryRes?.entry) {
            setDuplicateEntry(entryRes.entry);
            setLoading(false);
            return;
          }
        }
      } catch (e) {
        console.warn('Could not check active entry:', e);
      }

      // טען את geofencingEnabled עדכני — דרך backend function
      let isGeoEnabled = false;
      try {
        const geoRes = await invokePublic('getRestaurantSettings', {});
        isGeoEnabled = geoRes?.geofencing_enabled === true;
        console.log('geofencing_enabled:', isGeoEnabled);
      } catch (e) {
        console.error('Cannot check geofencing status:', e);
        isGeoEnabled = false;
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
      const res = await invokePublic('createQueueEntry', {
        customer_name: form.customer_name.trim(),
        phone: form.phone.trim(),
        party_size: parseInt(form.party_size),
        seating_preference: form.seating_preference,
      });
      console.log('Response from createQueueEntry:', res);
      
      if (res.error || !res?.entry) {
        throw new Error(res.error || 'שגיאה בהרשמה - נסה שוב');
      }
      
      const newEntry = res.entry;
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



  // דף כניסה לתור קיים (כתוצאה מחיפוש אוטומטי)
  if (existingEntry) {
    const waitTime = existingEntry.timestamp_approved 
      ? Math.round((Date.now() - new Date(existingEntry.timestamp_approved).getTime()) / 60000)
      : '?';
    
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)' }} dir="rtl">
        <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 w-full max-w-sm text-center border border-white/20">
          <div className="text-5xl mb-4 animate-bounce">👋</div>
          <h2 className="text-2xl font-black text-slate-800 mb-2">שלום שוב!</h2>
          <p className="text-slate-600 text-sm mb-6">אנחנו כבר זוכרים אותך</p>
          
          <div className="bg-blue-50 border-2 border-blue-300 rounded-2xl p-4 mb-6 space-y-3">
            <div className="text-center">
              <p className="text-sm text-blue-600 font-medium">🟢 סטטוס</p>
              <p className="text-base font-black text-blue-700 mt-1">
                {existingEntry.status === 'pending' ? '⏳ ממתין לאישור' : '🎯 פעיל בתור'}
              </p>
            </div>
            
            {existingEntry.status === 'active' && (
              <div className="text-center pt-2 border-t border-blue-200">
                <p className="text-xs text-blue-600 mb-1">⏱️ זמן המתנה</p>
                <p className="font-bold text-blue-700 text-lg">{waitTime} דקות</p>
              </div>
            )}

            <div className="text-center pt-2 border-t border-blue-200">
              <p className="text-xs text-blue-600 mb-1">👥 גודל קבוצה</p>
              <p className="font-bold text-blue-700">{existingEntry.party_size} סועדים</p>
            </div>

            {existingEntry.time_credits_earned > 0 && (
              <div className="text-center pt-2 border-t border-blue-200 bg-yellow-50 rounded-xl p-2">
                <p className="text-xs text-yellow-600 mb-1">💰 מטבעות שצברת</p>
                <p className="font-black text-yellow-700">{existingEntry.time_credits_earned}</p>
              </div>
            )}
          </div>

          <button
            onClick={() => window.location.href = `/QueueJoin?id=${existingEntry.id}`}
            className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black py-3.5 rounded-2xl text-base transition-all shadow-lg mb-2"
          >
            ↩️ חזור לתור שלי
          </button>
          <button
            onClick={() => { setExistingEntry(null); setForm({ customer_name: '', phone: '', party_size: 2 }); }}
            className="w-full text-slate-400 text-sm hover:text-slate-600 transition-colors"
          >
            ← טלפון אחר
          </button>
        </div>
      </div>
    );
  }

  // דף כניסה לתור קיים (דרך duplicateEntry - עדיין משמורה לתאימות)
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
      <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)' }} dir="rtl" lang="he">
        {/* Skip to main content */}
        <a
          href="#register-form"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:right-4 focus:bg-blue-600 focus:text-white focus:px-4 focus:py-2 focus:rounded focus:z-50"
        >
          דלג לטופס ההרשמה
        </a>
        <AccessibilityWidget />
        {/* לוגו */}
        <div className="text-center mb-10">
          <div className="text-7xl mb-4 drop-shadow-lg">🍽️</div>
          <h1 className="text-4xl font-black text-white tracking-wider">עלינא</h1>
          <p className="text-slate-300 text-sm mt-2 font-light">ברוכים הבאים לחוויה קולינרית עדינה</p>
        </div>

        {/* כרטיסית */}
        <div
          className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 w-full max-w-sm border border-white/20"
          id="register-form"
          role="main"
          aria-label="טופס הרשמה לתור"
        >
          <h2 className="text-2xl font-black text-slate-800 mb-6 text-center" id="form-title">הצטרפות לתור</h2>

          <form
            aria-labelledby="form-title"
            onSubmit={e => { e.preventDefault(); checkGeoAndRegister(); }}
            noValidate
          >
          <div className="space-y-5">
            {/* שם */}
            <div>
              <label htmlFor="field-name" className="text-sm font-bold text-slate-700 block mb-2">
                <span aria-hidden="true">👤 </span>שם מלא
              </label>
              <input
                id="field-name"
                className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-base focus:outline-none focus:border-slate-800 focus:shadow-md transition-all"
                placeholder="הכנס את שמך המלא"
                value={form.customer_name}
                onChange={e => setForm({ ...form, customer_name: e.target.value })}
                autoComplete="name"
                aria-required="true"
                aria-label="שם מלא"
              />
            </div>

            {/* טלפון */}
            <div>
              <label htmlFor="field-phone" className="text-sm font-bold text-slate-700 block mb-2">
                <span aria-hidden="true">📱 </span>מספר טלפון
              </label>
              <input
                id="field-phone"
                className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-base focus:outline-none focus:border-slate-800 focus:shadow-md transition-all"
                placeholder="050-0000000"
                type="tel"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                autoComplete="tel"
                aria-required="true"
                aria-label="מספר טלפון"
                inputMode="tel"
              />
              
              {/* בנר היסטוריה קודמת - אוטומטי */}
              {customerHistory && (
                <div className="mt-3 bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-300 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-blue-700">👋 שלום שוב!</span>
                    <span className="text-xs text-blue-600">ביקור #{customerHistory.visitCount + 1}</span>
                  </div>
                  
                  <div className="flex gap-2 flex-wrap text-xs">
                    {customerHistory.seatedCount > 0 && (
                      <div className="bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold">
                        ✅ {customerHistory.seatedCount} הושבו
                      </div>
                    )}
                    {customerHistory.abandonedCount > 0 && (
                      <div className="bg-red-100 text-red-700 px-2 py-1 rounded-full font-bold">
                        ❌ {customerHistory.abandonedCount} נטשו
                      </div>
                    )}
                    {customerHistory.totalCredits > 0 && (
                      <div className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full font-bold">
                        💰 {customerHistory.totalCredits} מטבעות
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* אישור תקנון */}
            <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  id="terms-checkbox"
                  checked={termsAccepted}
                  onChange={e => setTermsAccepted(e.target.checked)}
                  aria-required="true"
                  aria-describedby="terms-desc"
                  className="mt-1 w-5 h-5 accent-slate-800 flex-shrink-0 cursor-pointer"
                />
                <span id="terms-desc" className="text-sm text-slate-700 leading-relaxed">
                  אני מאשר/ת את{' '}
                  <a href="/TermsOfUse" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-bold" aria-label="פתח תקנון שימוש בחלון חדש">תקנון השימוש</a>
                  {' '}ואת{' '}
                  <a href="/PrivacyPolicy" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-bold" aria-label="פתח מדיניות פרטיות בחלון חדש">מדיניות הפרטיות</a>
                  {' '}ומסכים/ה לקבל עדכוני תור ב-SMS / WhatsApp.{' '}
                  <span className="text-slate-500">(קבלת הודעות שיווקיות — אופציונלי, ניתן לבטל בכל עת)</span>
                </span>
              </label>
            </div>

            {/* כמות סועדים */}
            <fieldset>
              <legend className="text-sm font-bold text-slate-700 block mb-2">
                <span aria-hidden="true">🍴 </span>כמות סועדים
              </legend>
              <div className="grid grid-cols-4 gap-2" role="group" aria-label="בחר כמות סועדים">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setForm({ ...form, party_size: n })}
                    aria-pressed={form.party_size === n}
                    aria-label={n === 8 ? '8 סועדים ומעלה' : `${n} סועדים`}
                    className={`py-3 rounded-xl font-bold text-lg transition-all focus:outline-none focus:ring-2 focus:ring-slate-800 ${
                      form.party_size === n
                        ? 'bg-slate-800 text-white shadow-lg scale-105'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {n === 8 ? '8+' : n}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* העדפת הושבה */}
            <fieldset>
              <legend className="text-sm font-bold text-slate-700 block mb-2">
                <span aria-hidden="true">🪑 </span>העדפת הושבה
              </legend>
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="בחר העדפת הושבה">
                {[
                  { id: 'no_preference', label: 'לא משנה לי', emoji: '🤷' },
                  { id: 'inside', label: 'רק בפנים', emoji: '🏠' },
                  { id: 'outside', label: 'רק בחוץ', emoji: '🌳' }
                ].map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setForm({ ...form, seating_preference: option.id })}
                    aria-pressed={(form.seating_preference || 'no_preference') === option.id}
                    aria-label={option.label}
                    className={`py-3 rounded-xl font-bold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-slate-800 ${
                      (form.seating_preference || 'no_preference') === option.id
                        ? 'bg-slate-800 text-white shadow-lg'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span aria-hidden="true">{option.emoji}</span><br/>{option.label}
                  </button>
                ))}
              </div>
            </fieldset>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center" role="alert" aria-live="assertive">
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
                type="submit"
                disabled={loading || geoStatus === 'checking'}
                aria-busy={loading}
                aria-label="הצטרף לתור"
                className="w-full bg-slate-800 hover:bg-slate-900 active:scale-95 text-white font-black py-4 rounded-2xl text-lg transition-all disabled:opacity-50 shadow-xl mt-2 focus:outline-none focus:ring-4 focus:ring-slate-400"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2" aria-live="polite" aria-atomic="true">
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    מצטרף...
                  </span>
                ) : <><span aria-hidden="true">✨ </span>הצטרף לתור</>}
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowQueueList(!showQueueList)}
              aria-expanded={showQueueList}
              aria-controls="queue-list-modal"
              className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2 rounded-xl text-sm transition-all mt-1 focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              <span aria-hidden="true">👥 </span>{showQueueList ? 'הסתר' : 'הצג'} רשימת ממתינים
            </button>
          </div>
          </form>
        </div>

        {/* מודאל רשימת ממתינים */}
        {showQueueList && (
          <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 p-4" dir="rtl">
            <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl mb-4 max-h-96 overflow-y-auto">
              <h3 className="text-lg font-black text-gray-800 mb-4 text-center">👥 ממתינים לאישור ({allQueueEntries.length})</h3>
              
              {allQueueEntries.length === 0 ? (
                <p className="text-gray-400 text-center text-sm">אין ממתינים כרגע</p>
              ) : (
                <div className="space-y-2">
                  {allQueueEntries.map(entry => (
                    <div key={entry.id} className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-4 flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-800">{entry.customer_name}</p>
                        <p className="text-xs text-gray-500">{entry.phone}</p>
                        <p className="text-xs text-gray-400 mt-1">👥 {entry.party_size} סועדים</p>
                      </div>
                      <button
                        onClick={() => handleDeleteEntry(entry.id)}
                        className="ml-2 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold transition-all"
                      >
                        ❌ מחק
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => setShowQueueList(false)}
                className="w-full text-gray-400 text-sm mt-4 py-2 hover:text-gray-600 transition-colors"
              >
                ← סגור
              </button>
            </div>
          </div>
        )}

        <footer className="text-center mt-8 space-y-1">
          <p className="text-slate-400 text-xs font-light">מסעדת עלינא © 2026</p>
          <a
            href="/AccessibilityStatement"
            className="text-slate-400 text-xs underline hover:text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 rounded"
            aria-label="קרא את הצהרת הנגישות של עלינא"
          >
            הצהרת נגישות
          </a>
          <span className="text-slate-600 text-xs mx-1">|</span>
          <a
            href="/PrivacyPolicy"
            className="text-slate-400 text-xs underline hover:text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 rounded"
            aria-label="קרא את מדיניות הפרטיות של עלינא"
          >
            מדיניות פרטיות
          </a>
        </footer>
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
                     await invokePublic('updateProximityResponse', { entryId, response: 'yes' });
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
                     await invokePublic('updateProximityResponse', { entryId, response: 'no' });
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
                       await invokePublic('seatGuest', { entryId });
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

          {/* כפתור משחק - בזמן המתנה וכשמושב */}
          {isActive && (
            <div className="text-center pt-1">
              <a
                href={`/QueueGame?entry=${entryId}&name=${encodeURIComponent(entry?.customer_name || 'אורח')}`}
                className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 active:scale-95 text-white font-black py-3.5 rounded-2xl text-base transition-all shadow-lg"
              >
                🎮 {callSecondsLeft ? 'משחקים בזמן ההמתנה' : 'המשך לשחק'}
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
                        const res = await invokePublic('selectTreat', { entryId, treatId: treat.id, treatCost: treat.cost });
                        setTimeCreditsEarned(res?.remainingCredits || 0);
                        setShowTreatModal(false);
                        setEntry(prev => ({ ...prev, selected_treat_id: treat.id, time_credits_earned: res?.remainingCredits }));
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

      <footer className="text-center mt-8 space-y-1">
        <p className="text-slate-400 text-xs font-light">מסעדת עלינא © 2026</p>
        <a
          href="/AccessibilityStatement"
          className="text-slate-400 text-xs underline hover:text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 rounded"
          aria-label="קרא את הצהרת הנגישות של עלינא"
        >
          הצהרת נגישות
        </a>
        <span className="text-slate-600 text-xs mx-1">|</span>
        <a
          href="/PrivacyPolicy"
          className="text-slate-400 text-xs underline hover:text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 rounded"
          aria-label="קרא את מדיניות הפרטיות של עלינא"
        >
          מדיניות פרטיות
        </a>
      </footer>
    </div>
  );
}

export default function QueueJoin() {
  return <QueueJoinInner />;
}