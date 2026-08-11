import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import useMyPermissions from '@/hooks/useMyPermissions';
import { SURFACES } from '@/lib/surfaces';
import { T } from './tokens';
import * as Icons from 'lucide-react';

// A surface is a way in, not a new screen. It groups screens that already exist
// and links to them — nothing here re-implements a page, so permissions, deep
// links and every existing route keep working exactly as before.
//
// Screens the viewer isn't permitted to open are dropped, and a group with
// nothing left in it disappears rather than showing an empty tab.
export default function Surface({ surfaceKey }) {
  const { can, loading } = useMyPermissions();
  const surface = SURFACES.find((s) => s.key === surfaceKey);

  const groups = useMemo(() => {
    if (!surface) return [];
    return surface.groups
      .map((g) => ({ ...g, pages: g.pages.filter((p) => (loading ? true : can(p.page))) }))
      .filter((g) => g.pages.length > 0);
  }, [surface, can, loading]);

  const [tab, setTab] = useState(0);
  if (!surface) return null;

  if (!loading && !groups.length) {
    return (
      <div className="p-6 text-center" dir="rtl">
        <div className="text-base font-bold" style={{ color: T.espresso }}>אין לך גישה לאזור הזה</div>
        <div className="text-sm mt-1" style={{ color: T.muted }}>
          בקש/י מהמנהל להוסיף הרשאה במסך ההרשאות.
        </div>
      </div>
    );
  }

  const active = groups[Math.min(tab, groups.length - 1)] || { pages: [] };
  const Ico = Icons[surface.icon] || Icons.LayoutGrid;

  return (
    <div className="p-4 max-w-4xl mx-auto" dir="rtl">
      <div className="flex items-center gap-3 mb-3">
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: T.cream }}
        >
          <Ico className="w-5 h-5" style={{ color: T.goldLo }} />
        </span>
        <div className="min-w-0">
          <h1 className="text-[21px] font-bold leading-tight" style={{ color: T.espresso }}>{surface.title}</h1>
          <div className="text-[12.5px]" style={{ color: T.muted }}>{surface.subtitle}</div>
        </div>
      </div>

      {groups.length > 1 && (
        <div className="flex gap-1 flex-wrap mb-3 pb-2" style={{ borderBottom: `1px solid ${T.line}` }}>
          {groups.map((g, i) => (
            <button
              key={g.label}
              onClick={() => setTab(i)}
              className="text-[12.5px] px-3 rounded-lg min-h-[40px]"
              style={i === tab
                ? { background: T.cream, color: T.espresso, fontWeight: 700 }
                : { background: 'transparent', color: T.muted }}
              aria-pressed={i === tab}
            >
              {g.label}
              <span className="text-[11px] tabular-nums mr-1.5" style={{ color: T.muted }}>{g.pages.length}</span>
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.line}`, background: T.creamHi }}>
        {active.pages.map((p, i) => (
          <Link
            key={p.page}
            to={createPageUrl(p.page)}
            className="flex items-center gap-3 px-4 min-h-[52px] py-2 hover:opacity-90 transition-opacity"
            style={i ? { borderTop: `1px solid ${T.line}` } : undefined}
          >
            <span className="flex-1 text-[14px] font-semibold" style={{ color: T.espresso }}>{p.label}</span>
            <Icons.ChevronLeft className="w-4 h-4 shrink-0" style={{ color: T.muted }} />
          </Link>
        ))}
      </div>
    </div>
  );
}
