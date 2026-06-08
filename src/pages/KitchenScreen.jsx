// Ambient TV screen for the kitchen / bar / back-of-house. Designed to be
// shown on a wall-mounted display so the team has ambient awareness without
// looking at their phones. Auto-refresh every 30s. Fullscreen, dark theme,
// huge typography so it's readable from across the room.
//
// URL: /KitchenScreen — no sidebar, no auth gate on the data side.
// The component pulls everything in one /getKitchenScreenData call.
import React, { useEffect, useState } from 'react';
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
  const now = useNow();

  const load = async () => {
    try {
      const res = await base44.functions.getKitchenScreenData({});
      const r = res?.data ?? res;
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

  // Fullscreen entry on first user interaction (autoplay restrictions)
  useEffect(() => {
    const handler = () => {
      if (document.fullscreenElement) return;
      document.documentElement.requestFullscreen?.().catch(() => {});
    };
    window.addEventListener('click', handler, { once: true });
    return () => window.removeEventListener('click', handler);
  }, []);

  const bc = data?.beecomm;
  const gm = data?.gomiley;
  const goal = data?.sales_goal;
  const board = Array.isArray(data?.leaderboard) ? data.leaderboard : [];
  const pred = data?.predicted_hour;

  const workers = Array.isArray(bc?.workers) ? bc.workers.slice(0, 6) : [];
  const topDishes = Array.isArray(bc?.top_dishes) ? bc.top_dishes.slice(0, 5) : [];

  // Hourly bars — show last 12 hours
  const oh = bc?.orders_by_hour || {};
  const ohKeys = Object.keys(oh).sort((a, b) => Number(a) - Number(b)).slice(-12);
  const maxHour = Math.max(1, ...ohKeys.map(k => Number(oh[k]?.totalSum) || 0));

  // Urgency colors for Gomiley
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
      {/* Top bar — clock + date + restaurant name + last update */}
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
          {/* Row 1 — Big revenue tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
            <BigTile label="קופה היום" value={fmtIls(bc?.total_today)} color="#10b981" sub={bc?.fallback_date ? `מציג: ${bc.fallback_date}` : null} />
            <BigTile label="טיפים" value={fmtIls(bc?.total_tips)} color="#3b82f6" />
            <BigTile label="כסף פתוח" value={fmtIls(bc?.open_money)} color="#f59e0b" />
            <BigTile label="משלוחים היום" value={gm ? gm.total_orders : 0} color="#8b5cf6" sub={gm ? fmtIls(gm.total_income_today) : null} />
          </div>

          {/* Row 2 — Gomiley pending + Predicted next hour + Active sales goal */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <PendingTile
              gm={gm}
              urgent={gomileyUrgent}
              warn={gomileyWarn}
            />
            <PredictedHourTile pred={pred} />
            <GoalTile goal={goal} />
          </div>

          {/* Row 3 — 3 cols: Active waiters | Leaderboard | Top dishes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <Panel title="👥 במשמרת">
              {workers.length === 0 ? (
                <Empty>אין מלצרים במשמרת</Empty>
              ) : workers.map((w, i) => (
                <Row key={i} left={<b>{w.name}</b>} right={`${w.diners || 0} סועדים · ${fmtIls(w.sum)}`} />
              ))}
            </Panel>

            <Panel title="🏆 הלוח של היום">
              {board.length === 0 ? (
                <Empty>עוד אין מכירות גמיפיקציה</Empty>
              ) : board.map((p, i) => (
                <Row key={i} left={<><span style={{ color: i === 0 ? '#fbbf24' : '#94a3b8', fontWeight: 'bold', marginLeft: '8px' }}>#{i + 1}</span><b>{p.user_name}</b></>} right={`${p.count} מכירות · ${fmtIls(p.bonus_sum)} בונוס`} />
              ))}
            </Panel>

            <Panel title="🍽️ Top מנות">
              {topDishes.length === 0 ? (
                <Empty>אין נתונים</Empty>
              ) : topDishes.map((d, i) => (
                <Row key={i} left={<b style={{ fontSize: '18px' }}>{d.name}</b>} right={`×${d.quantity} · ${fmtIls(d.sum)}`} />
              ))}
            </Panel>
          </div>

          {/* Row 4 — Hourly bars */}
          {ohKeys.length > 0 && (
            <Panel title="📊 פר שעה — קופה (12 שעות אחרונות)">
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '120px', padding: '8px 0' }}>
                {ohKeys.map(h => {
                  const total = Number(oh[h]?.totalSum) || 0;
                  const diners = Number(oh[h]?.diners) || 0;
                  const height = Math.max(4, Math.round((total / maxHour) * 100));
                  return (
                    <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ fontSize: '11px', color: '#fbbf24', marginBottom: '4px' }}>{fmtIls(total)}</div>
                      <div style={{ width: '100%', height: `${height}%`, background: 'linear-gradient(to top, #f59e0b, #fbbf24)', borderRadius: '6px 6px 0 0' }} />
                      <div style={{ fontSize: '14px', color: '#94a3b8', marginTop: '4px' }}>{h}:00</div>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>{diners}👤</div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

function BigTile({ label, value, color, sub }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.06)', border: `2px solid ${color}40`, borderRadius: '16px', padding: '20px', textAlign: 'center' }}>
      <div style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '48px', fontWeight: 'bold', color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>{sub}</div>}
    </div>
  );
}

function PendingTile({ gm, urgent, warn }) {
  const bg = urgent ? 'linear-gradient(135deg, #7f1d1d, #991b1b)' : warn ? 'linear-gradient(135deg, #78350f, #92400e)' : 'rgba(255,255,255,0.06)';
  const accent = urgent ? '#fca5a5' : warn ? '#fbbf24' : '#94a3b8';
  return (
    <div style={{ background: bg, borderRadius: '16px', padding: '20px', textAlign: 'center', border: `2px solid ${accent}40` }}>
      <div style={{ fontSize: '14px', color: accent, marginBottom: '8px' }}>🛵 משלוחים פתוחים</div>
      <div style={{ fontSize: '52px', fontWeight: 'bold', color: '#f1f5f9', lineHeight: 1 }}>
        {gm ? gm.pending_count : 0}
      </div>
      {gm?.stuck_count > 0 && (
        <div style={{ fontSize: '18px', color: '#fca5a5', marginTop: '8px', fontWeight: 'bold' }}>
          ⚠️ {gm.stuck_count} ממתינים 10+ דק׳
        </div>
      )}
      {!gm && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px' }}>אין נתונים</div>}
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
    high: { bg: 'linear-gradient(135deg, #7c2d12, #9a3412)', text: '#fed7aa', label: 'עומס גבוה' },
    mid: { bg: 'linear-gradient(135deg, #713f12, #854d0e)', text: '#fde68a', label: 'עומס בינוני' },
    low: { bg: 'rgba(255,255,255,0.06)', text: '#86efac', label: 'רגוע' },
  };
  const c = colors[intensity];
  return (
    <div style={{ background: c.bg, borderRadius: '16px', padding: '20px', textAlign: 'center', border: `2px solid ${c.text}40` }}>
      <div style={{ fontSize: '14px', color: c.text, marginBottom: '4px' }}>📈 ב-{pred.hour}:00 צפויים</div>
      <div style={{ fontSize: '52px', fontWeight: 'bold', color: '#f1f5f9', lineHeight: 1 }}>{pred.avg_diners}</div>
      <div style={{ fontSize: '16px', color: c.text, marginTop: '6px', fontWeight: 'bold' }}>סועדים · {c.label}</div>
      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>ממוצע מ-{pred.sample_size} ימים</div>
    </div>
  );
}

function GoalTile({ goal }) {
  if (!goal) {
    return (
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '20px', textAlign: 'center', border: '2px solid #94a3b840' }}>
        <div style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '8px' }}>🎯 יעד פעיל</div>
        <div style={{ fontSize: '24px', color: '#64748b', padding: '20px 0' }}>אין יעד עכשיו</div>
      </div>
    );
  }
  const pct = goal.target > 0 ? Math.min(100, Math.round((goal.sold / goal.target) * 100)) : 0;
  return (
    <div style={{ background: 'linear-gradient(135deg, #166534, #15803d)', borderRadius: '16px', padding: '20px', textAlign: 'center', border: '2px solid #86efac40' }}>
      <div style={{ fontSize: '14px', color: '#bbf7d0', marginBottom: '6px' }}>🎯 יעד פעיל</div>
      <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#f1f5f9' }}>{goal.template_label}</div>
      <div style={{ fontSize: '44px', fontWeight: 'bold', color: '#f1f5f9', lineHeight: 1, marginTop: '8px' }}>
        {goal.sold} / {goal.target}
      </div>
      <div style={{ background: 'rgba(0,0,0,0.3)', height: '8px', borderRadius: '4px', marginTop: '12px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: '#86efac' }} />
      </div>
      <div style={{ fontSize: '12px', color: '#bbf7d0', marginTop: '6px' }}>בונוס ₪{goal.bonus} למכירה</div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #ffffff15', borderRadius: '16px', padding: '16px' }}>
      <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fbbf24', marginBottom: '12px', borderBottom: '1px solid #ffffff15', paddingBottom: '8px' }}>{title}</div>
      <div>{children}</div>
    </div>
  );
}

function Row({ left, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #ffffff08', fontSize: '16px' }}>
      <div>{left}</div>
      <div style={{ color: '#cbd5e1' }}>{right}</div>
    </div>
  );
}

function Empty({ children }) {
  return <div style={{ color: '#64748b', textAlign: 'center', padding: '20px 0', fontSize: '14px' }}>{children}</div>;
}
