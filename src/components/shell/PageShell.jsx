import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { T, TONE } from './tokens';

// The page shell — four independent pieces every screen can compose:
//
//   <AlertBar>      only when something on this page is actually wrong
//   <PageHead>      title, optional subtitle, controls on the far side
//   <PillTabs>      only when the page has sections
//   <MetricCards>   only when the page has headline numbers
//
// None of them are required. A screen that has no urgent state renders no
// banner; a screen with nothing to count renders no cards. Forcing every page
// through the same full template is what makes an app feel padded, so the rule
// here is that a piece appears when it has something to say and is absent
// otherwise.

export function AlertBar({ tone = 'bad', title, detail, action, to }) {
  if (!title) return null;
  const c = TONE[tone] || TONE.bad;
  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-xl mb-3"
      style={{ background: c.bg, border: `1px solid ${T.line}` }}
      role="status"
    >
      <AlertCircle className="w-[18px] h-[18px] shrink-0 mt-0.5" style={{ color: c.dot }} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold" style={{ color: c.fg }}>{title}</div>
        {detail && <div className="text-[11.5px] leading-relaxed mt-0.5" style={{ color: c.fg }}>{detail}</div>}
      </div>
      {action && to && (
        <Link
          to={to}
          className="shrink-0 rounded-lg px-3 flex items-center text-[12px] font-bold min-h-[36px]"
          style={{ background: T.gold, color: T.espresso }}
        >
          {action}
        </Link>
      )}
    </div>
  );
}

export function PageHead({ title, subtitle, children }) {
  return (
    <div className="flex items-center gap-2 flex-wrap mb-3">
      <div className="min-w-0">
        <h1 className="text-[21px] font-bold leading-tight" style={{ color: T.espresso }}>{title}</h1>
        {subtitle && <div className="text-[12px] mt-0.5" style={{ color: T.muted }}>{subtitle}</div>}
      </div>
      {children && <div className="flex items-center gap-2 ms-auto flex-wrap">{children}</div>}
    </div>
  );
}

// A control that sits in the head — a date range, a filter, a secondary action.
export function HeadControl({ children, onClick }) {
  const Cmp = onClick ? 'button' : 'span';
  return (
    <Cmp
      onClick={onClick}
      className="rounded-lg px-3 flex items-center gap-1.5 text-[12px] min-h-[36px]"
      style={{ border: `1px solid ${T.line}`, background: T.creamHi, color: T.espresso }}
    >
      {children}
    </Cmp>
  );
}

export function HeadAction({ children, to, onClick }) {
  const cls = 'rounded-lg px-3.5 flex items-center gap-1.5 text-[12.5px] font-bold min-h-[36px]';
  const style = { background: T.gold, color: T.espresso, border: `1px solid ${T.gold}` };
  return to
    ? <Link to={to} className={cls} style={style}>{children}</Link>
    : <button onClick={onClick} className={cls} style={style}>{children}</button>;
}

export function PillTabs({ tabs, value, onChange }) {
  if (!tabs?.length) return null;
  return (
    <div className="flex gap-1 flex-wrap mb-3">
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            onClick={() => onChange?.(t.id)}
            className="text-[12.5px] px-3 rounded-lg min-h-[36px]"
            style={on
              ? { background: T.cream, color: T.espresso, fontWeight: 700 }
              : { background: 'transparent', color: T.muted }}
            aria-pressed={on}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// items: [{ k, v, sub, tone: 'good'|'bad'|null, to }]
export function MetricCards({ items }) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  return (
    <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(148px,1fr))' }}>
      {list.map((c) => {
        const body = (
          <>
            <div className="text-[11.5px]" style={{ color: T.muted }}>{c.k}</div>
            <div className="text-[21px] font-bold tabular-nums leading-tight mt-0.5" style={{ color: T.espresso }}>{c.v}</div>
            {c.sub && (
              <div
                className="text-[11px] tabular-nums mt-0.5"
                style={{ color: c.tone === 'bad' ? T.bad : c.tone === 'good' ? T.good : T.muted }}
              >
                {c.sub}
              </div>
            )}
          </>
        );
        const style = { border: `1px solid ${T.line}`, background: T.creamHi };
        const cls = 'rounded-xl px-3 py-2.5 text-center block';
        return c.to
          ? <Link key={c.k} to={c.to} className={cls + ' transition-opacity hover:opacity-90'} style={style}>{body}</Link>
          : <div key={c.k} className={cls} style={style}>{body}</div>;
      })}
    </div>
  );
}

// Bars from a real series. Renders nothing below two points, and nothing when
// every point is identical: a flat metric drawn as bars is a solid block of
// colour that reads as a broken chart, not as "this held steady". On a page
// that doesn't need a chart this simply never gets called.
export function MiniBars({ label, series, unit = '', maxPoints = 14 }) {
  const s = (series || []).slice(-maxPoints);
  if (s.length < 2) return null;
  const lo = Math.min(...s);
  const hi = Math.max(...s);
  if (hi === lo) return null;
  const min = Math.min(lo, 0);
  const max = hi;
  const span = (max - min) || 1;
  return (
    <div className="rounded-xl p-3 mb-3" style={{ border: `1px solid ${T.line}`, background: T.creamHi }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[13px] font-bold" style={{ color: T.espresso }}>{label}</span>
        <span className="text-[11.5px] tabular-nums ms-auto" style={{ color: T.muted }}>{s.length} ימים</span>
      </div>
      <div className="flex items-end gap-1.5 h-[92px]" style={{ borderBottom: `1px solid ${T.line}` }}>
        {s.map((v, i) => (
          <span
            key={i}
            title={`${v}${unit}`}
            className="flex-1 rounded-t"
            style={{
              height: `${Math.max(4, ((v - min) / span) * 100)}%`,
              background: T.goldHi,
              borderBottom: `3px solid ${T.gold}`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
