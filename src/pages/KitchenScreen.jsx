// Ambient TV screen for kitchen / bar / back-of-house.
// Redesigned per owner feedback: kitchen-relevant only — no cash/tips, no
// dish charts. Focus: deliveries, people count, shortages, active goals.
// New-delivery toast banner appears for 8s when pending count grows.
import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';

const REFRESH_MS = 30_000;

function fmtIls(n) {
  return '₪' + Math.round(Number(n) || 0).toLocaleString('he-IL');
}

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  return now;
}

function fmtClock(d) {
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
}
function fmtDayHebrew(d) {
  return d.toLocaleDateString('he-IL', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'Asia/Jerusalem' });
}

export default function KitchenScreen() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [newDeliveryToast, setNewDeliveryToast] = useState(null);
  const prevPendingRef = useRef(null);
  const now = useNow();

  const load = async () => {
    try {
      const res = await base44.functions.getKitchenScreenData({});
      const r = res?.data ?? res;
      // Detect new delivery — pending count grew
      const newPending = r?.gomiley?.pending_count ?? 0;
      const prevPending = prevPendingRef.current;
      if (prevPending !== null && newPending > prevPending) {
        const diff = newPending - prevPending;
        setNewDeliveryToast({ diff, at: Date.now() });
        setTimeout(() => setNewDeliveryToast(null), 8000);
        // Try to play a soft notification sound (if browser allows)
        try {
          const audio = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQBvX18=');
          audio.volume = 0.3;
          audio.play().catch(() => {});
        } catch {}
      }
      prevPendingRef.current = newPending;
      setData(r);
      setError(null);
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  useEffect(() => {
    load();
    const i = setInterval(load, REFRESH_MS);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    const handler = () => {
      if (document.fullscreenElement) return;
      document.documentElement.requestFullscreen?.().catch(() => {});
    };
    window.addEventListener('click', handler, { once: true });
    return () => window.removeEventListener('click', handler);
  }, []);

  const gm = data?.gomiley;
  const goals = Array.isArray(data?.sales_goals) ? data.sales_goals : [];
  const pred = data?.predicted_hour;
  const dining = data?.currently_dining ?? 0;
  const arriving = Array.isArray(data?.arriving_soon) ? data.arriving_soon : [];
  const arrivingTotal = data?.arriving_soon_count ?? 0;
  const lowKitchen = Array.isArray(data?.low_inventory?.kitchen) ? data.low_inventory.kitchen : [];
  const lowBar = Array.isArray(data?.low_inventory?.bar) ? data.low_inventory.bar : [];
  const shortagesSource = data?.low_inventory?.source; // 'brief' or 'alerts'
  const dailySpecials = Array.isArray(data?.daily_specials) ? data.daily_specials : [];
  const platforms = Array.isArray(data?.deliveries_by_platform) ? data.deliveries_by_platform : [];
  const workers = Array.isArray(data?.beecomm?.workers) ? data.beecomm.workers.slice(0, 6) : [];

  const gomileyUrgent = gm && (gm.stuck_count >= 3 || gm.pending_count >= 8);
  const gomileyWarn = gm && (gm.stuck_count >= 1 || gm.pending_count >= 5);

  return (
    <div dir="rtl" style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      color: '#f1f5f9',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      padding: '20px',
      overflow: 'hidden',
    }}>
      {/* New delivery toast */}
      {newDeliveryToast && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #15803d, #16a34a)', color: 'white',
          padding: '16px 32px', borderRadius: '16px', fontSize: '24px', fontWeight: 'bold',
          boxShadow: '0 12px 40px rgba(34, 197, 94, 0.5)', zIndex: 1000,
          border: '2px solid #86efac', animation: 'slideDown 0.4s ease-out',
        }}>
          🛵 {newDeliveryToast.diff === 1 ? 'משלוח חדש נכנס!' : `${newDeliveryToast.diff} משלוחים חדשים!`}
        </div>
      )}
      <style>{`@keyframes slideDown { from { transform: translate(-50%, -100px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }`}</style>

      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '20px', padding: '0 8px' }}>
        <div>
          <div style={{ fontSize: '64px', fontWeight: 'bold', lineHeight: 1, color: '#fbbf24' }}>{fmtClock(now)}</div>
          <div style={{ fontSize: '20px', color: '#94a3b8', marginTop: '4px' }}>{fmtDayHebrew(now)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '40px', fontWeight: 'bold', color: '#f59e0b' }}>עלינא</div>
          <div style={{ fontSize: '14px', color: '#64748b' }}>רוטשילד 104, ראשון לציון</div>
        </div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: '12px', color: '#64748b' }}>עדכון אחרון</div>
          <div style={{ fontSize: '16px', color: '#94a3b8' }}>{data ? new Date(data.server_time).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '...'}</div>
          {error && <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px' }}>{error}</div>}
        </div>
      </div>

      {!data && !error && (
        <div style={{ textAlign: 'center', padding: '120px 0', fontSize: '32px', color: '#64748b' }}>טוען נתונים...</div>
      )}

      {data && (
        <>
          {/* Row 1 — Deliveries hero (2 big tiles) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <DeliveriesTodayTile gm={gm} platforms={platforms} />
            <PendingDeliveriesTile gm={gm} urgent={gomileyUrgent} warn={gomileyWarn} />
          </div>

          {/* Row 2 — People (3 tiles) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <CurrentDinersTile count={dining} />
            <ArrivingSoonTile count={arrivingTotal} items={arriving} />
            <PredictedHourTile pred={pred} />
          </div>

          {/* Row 3a — Daily Specials from today's brief (info banner) */}
          {dailySpecials.length > 0 && (
            <div style={{ background: 'linear-gradient(135deg, #831843, #9d174d)', border: '2px solid #f9a8d440', borderRadius: '16px', padding: '16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fbcfe8', marginBottom: '12px' }}>💡 ספיישלים — היום</div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(dailySpecials.length, 3)}, 1fr)`, gap: '12px' }}>
                {dailySpecials.slice(0, 3).map((s, i) => (
                  <div key={i} style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '10px', padding: '12px' }}>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f1f5f9' }}>{s.description}</div>
                    {s.target_value > 0 && (
                      <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#fbcfe8', marginTop: '4px', lineHeight: 1 }}>יעד: {s.target_value}</div>
                    )}
                    {s.bonus && (
                      <div style={{ fontSize: '13px', color: '#fbcfe8', marginTop: '6px' }}>🎁 {s.bonus}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Row 3b — Active SalesGoals with progress + marking */}
          {goals.length > 0 && (
            <Panel title="🎯 יעדים פעילים — מד התקדמות">
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(goals.length, 3)}, 1fr)`, gap: '12px' }}>
                {goals.slice(0, 3).map(g => (
                  <GoalCard key={g.id} goal={g} />
                ))}
              </div>
            </Panel>
          )}

          {/* Row 4 — Shortages (2 cols) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <ShortagesPanel title="🍳 חוסרים — מטבח" items={lowKitchen} color="#f59e0b" />
            <ShortagesPanel title="🍷 חוסרים — בר" items={lowBar} color="#a855f7" />
          </div>

          {/* Row 5 — Waiters in shift (compact) */}
          {workers.length > 0 && (
            <Panel title="👥 במשמרת">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                {workers.map((w, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold' }}>{w.name}</span>
                    <span style={{ color: '#94a3b8', fontSize: '14px' }}>{w.diners || 0} 👤</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

function DeliveriesTodayTile({ gm, platforms }) {
  const total = gm?.total_today ?? 0;
  const income = gm?.total_income_today ?? 0;
  const platformsTotal = platforms.reduce((s, p) => s + (p.total || 0), 0);

  return (
    <div style={{ background: 'rgba(139, 92, 246, 0.12)', border: '2px solid #a855f740', borderRadius: '16px', padding: '20px' }}>
      <div style={{ fontSize: '14px', color: '#c4b5fd', marginBottom: '8px' }}>🛵 משלוחים היום</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
        <div style={{ fontSize: '52px', fontWeight: 'bold', color: '#a855f7', lineHeight: 1 }}>{total}</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#c4b5fd' }}>{fmtIls(income)}</div>
      </div>
      {platforms.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          {platforms.slice(0, 5).map((p, i) => {
            const pct = platformsTotal > 0 ? Math.round((p.total / platformsTotal) * 100) : 0;
            const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#a855f7'];
            return (
              <div key={i} style={{ marginBottom: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#cbd5e1', marginBottom: '2px' }}>
                  <span style={{ fontWeight: 'bold' }}>{p.name}</span>
                  <span>{p.orders} · {fmtIls(p.total)} · {pct}%</span>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: colors[i % colors.length] }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {platforms.length === 0 && (
        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>אין פירוט פלטפורמות עדיין — יסרק ב-04:30 IL</div>
      )}
    </div>
  );
}

function PendingDeliveriesTile({ gm, urgent, warn }) {
  const bg = urgent ? 'linear-gradient(135deg, #7f1d1d, #991b1b)' : warn ? 'linear-gradient(135deg, #78350f, #92400e)' : 'rgba(255,255,255,0.06)';
  const accent = urgent ? '#fca5a5' : warn ? '#fbbf24' : '#94a3b8';
  return (
    <div style={{ background: bg, borderRadius: '16px', padding: '20px', textAlign: 'center', border: `2px solid ${accent}40` }}>
      <div style={{ fontSize: '14px', color: accent, marginBottom: '8px' }}>🛵 משלוחים פתוחים עכשיו</div>
      <div style={{ fontSize: '96px', fontWeight: 'bold', color: '#f1f5f9', lineHeight: 1 }}>
        {gm ? gm.pending_count : 0}
      </div>
      {gm?.stuck_count > 0 && (
        <div style={{ fontSize: '20px', color: '#fca5a5', marginTop: '12px', fontWeight: 'bold' }}>
          ⚠️ {gm.stuck_count} ממתינים 10+ דק׳
        </div>
      )}
      {!gm && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px' }}>אין נתונים</div>}
    </div>
  );
}

function CurrentDinersTile({ count }) {
  return (
    <div style={{ background: 'linear-gradient(135deg, #064e3b, #047857)', borderRadius: '16px', padding: '20px', textAlign: 'center', border: '2px solid #6ee7b740' }}>
      <div style={{ fontSize: '14px', color: '#a7f3d0', marginBottom: '8px' }}>🍽️ סועדים במסעדה</div>
      <div style={{ fontSize: '72px', fontWeight: 'bold', color: '#f1f5f9', lineHeight: 1 }}>{count}</div>
      <div style={{ fontSize: '12px', color: '#a7f3d0', marginTop: '8px' }}>הזמנות שמשובצות עכשיו</div>
    </div>
  );
}

function ArrivingSoonTile({ count, items }) {
  if (count === 0) {
    return (
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '20px', textAlign: 'center', border: '2px solid #94a3b840' }}>
        <div style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '8px' }}>⏰ צפויים ב-60 דק׳</div>
        <div style={{ fontSize: '52px', color: '#64748b' }}>0</div>
        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>אין הזמנות בקרוב</div>
      </div>
    );
  }
  return (
    <div style={{ background: 'linear-gradient(135deg, #1e3a8a, #1e40af)', borderRadius: '16px', padding: '16px', border: '2px solid #93c5fd40' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
        <span style={{ fontSize: '14px', color: '#bfdbfe' }}>⏰ צפויים ב-60 דק׳</span>
        <span style={{ fontSize: '36px', fontWeight: 'bold', color: '#f1f5f9' }}>{count}</span>
      </div>
      <div style={{ maxHeight: '120px', overflow: 'hidden' }}>
        {items.slice(0, 5).map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', padding: '4px 0', borderBottom: '1px solid #ffffff10' }}>
            <span style={{ color: '#bfdbfe', fontWeight: 'bold' }}>{r.time}</span>
            <span>{r.name}</span>
            <span style={{ color: '#bfdbfe' }}>{r.party}👤</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PredictedHourTile({ pred }) {
  if (!pred || pred.avg_diners === 0) {
    return (
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '20px', textAlign: 'center', border: '2px solid #94a3b840' }}>
        <div style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '8px' }}>📈 שעה הבאה — צפי</div>
        <div style={{ fontSize: '24px', color: '#64748b', padding: '20px 0' }}>אין מספיק היסטוריה</div>
      </div>
    );
  }
  const intensity = pred.avg_diners >= 25 ? 'high' : pred.avg_diners >= 12 ? 'mid' : 'low';
  const colors = {
    high: { bg: 'linear-gradient(135deg, #7c2d12, #9a3412)', text: '#fed7aa', label: 'עומס גבוה — היערכו' },
    mid: { bg: 'linear-gradient(135deg, #713f12, #854d0e)', text: '#fde68a', label: 'עומס בינוני' },
    low: { bg: 'rgba(255,255,255,0.06)', text: '#86efac', label: 'רגוע' },
  };
  const c = colors[intensity];
  return (
    <div style={{ background: c.bg, borderRadius: '16px', padding: '20px', textAlign: 'center', border: `2px solid ${c.text}40` }}>
      <div style={{ fontSize: '14px', color: c.text, marginBottom: '4px' }}>📈 ב-{pred.hour}:00 צפויים</div>
      <div style={{ fontSize: '64px', fontWeight: 'bold', color: '#f1f5f9', lineHeight: 1 }}>{pred.avg_diners}</div>
      <div style={{ fontSize: '14px', color: c.text, marginTop: '6px', fontWeight: 'bold' }}>סועדים · {c.label}</div>
      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>ממוצע מ-{pred.sample_size} ימים</div>
    </div>
  );
}

function GoalCard({ goal }) {
  const pct = goal.target > 0 ? Math.min(100, Math.round((goal.sold / goal.target) * 100)) : 0;
  const completed = goal.status === 'completed';
  const bg = completed ? 'linear-gradient(135deg, #6b21a8, #7e22ce)' : 'linear-gradient(135deg, #166534, #15803d)';
  const accent = completed ? '#e9d5ff' : '#bbf7d0';
  return (
    <div style={{ background: bg, borderRadius: '12px', padding: '14px', border: `2px solid ${accent}40` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
        <span style={{ fontSize: '20px', fontWeight: 'bold' }}>{goal.emoji} {goal.label}</span>
        {completed && <span style={{ fontSize: '11px', color: accent, fontWeight: 'bold' }}>✓ הושלם</span>}
      </div>
      <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#f1f5f9', lineHeight: 1 }}>
        {goal.sold} <span style={{ fontSize: '20px', color: accent }}>/ {goal.target}</span>
      </div>
      <div style={{ background: 'rgba(0,0,0,0.3)', height: '6px', borderRadius: '3px', marginTop: '8px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: accent }} />
      </div>
      <div style={{ fontSize: '11px', color: accent, marginTop: '4px' }}>{goal.bonus} 🪙 למכירה {completed ? '(בונוס)' : ''}</div>
    </div>
  );
}

function ShortagesPanel({ title, items, color }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}30`, borderRadius: '16px', padding: '16px' }}>
      <div style={{ fontSize: '18px', fontWeight: 'bold', color, marginBottom: '12px', borderBottom: `1px solid ${color}30`, paddingBottom: '8px' }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ color: '#94a3b8', textAlign: 'center', padding: '20px 0', fontSize: '14px' }}>✓ אין חוסרים</div>
      ) : (
        <div>
          {items.slice(0, 8).map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid #ffffff08', fontSize: '17px' }}>
              <span style={{ color: '#ef4444', fontSize: '16px' }}>●</span>
              <span style={{ fontWeight: 'bold' }}>{it.name}</span>
            </div>
          ))}
          {items.length > 8 && (
            <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', marginTop: '6px' }}>+{items.length - 8} פריטים נוספים</div>
          )}
        </div>
      )}
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #ffffff15', borderRadius: '16px', padding: '16px', marginBottom: '20px' }}>
      <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fbbf24', marginBottom: '12px', borderBottom: '1px solid #ffffff15', paddingBottom: '8px' }}>{title}</div>
      <div>{children}</div>
    </div>
  );
}
