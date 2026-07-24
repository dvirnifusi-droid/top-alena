// CRM — HR gaps across ALL employees, surfaced on the employees list so the
// owner sees who needs attention without opening each card.
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { AlertTriangle, ChevronDown, ChevronUp, CheckCircle2, ExternalLink } from 'lucide-react';

export default function HrAlertsBanner() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    base44.functions.getHrAlerts({})
      .then((r) => { if (alive) setData(r?.data || r); })
      .catch(() => { if (alive) setData({ employees: [], total: 0 }); });
    return () => { alive = false; };
  }, []);

  if (!data) return null;
  const list = data.employees || [];
  if (!list.length) {
    return (
      <div className="mb-4 flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2" dir="rtl">
        <CheckCircle2 className="w-4 h-4" /> כל העובדים מסודרים — אין טפסים או מעקבים חסרים.
      </div>
    );
  }
  const reds = list.filter((e) => e.red).length;

  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 overflow-hidden" dir="rtl">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-right">
        <span className="flex items-center gap-2 text-sm font-bold text-amber-900">
          <AlertTriangle className="w-4 h-4" /> {list.length} עובדים דורשים טיפול
          {reds > 0 && <span className="text-xs font-semibold bg-red-100 text-red-700 rounded-full px-2 py-0.5">{reds} דחוף</span>}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-amber-700" /> : <ChevronDown className="w-4 h-4 text-amber-700" />}
      </button>
      {open && (
        <div className="border-t border-amber-200 divide-y divide-amber-100 max-h-80 overflow-y-auto">
          {list.map((e) => (
            <div key={e.employee_id} className="flex items-center justify-between gap-2 px-3 py-2 bg-white/60">
              <div className="min-w-0">
                <Link to={createPageUrl(`EmployeeDetails?id=${e.employee_id}`)} className="text-sm font-medium text-[#44512C] hover:underline flex items-center gap-1">
                  {e.name} <ExternalLink className="w-3 h-3" />
                </Link>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {e.gaps.map((g, i) => (
                    <span key={i} className={`text-[11px] rounded-full px-2 py-0.5 ${g.level === 'red' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{g.text}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
