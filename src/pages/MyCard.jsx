import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, User, CalendarDays, FileText, CheckCircle2, Circle, Clock, AlertCircle } from 'lucide-react';
import PageGuard from '../components/shared/PageGuard';

const STATUS_HE = {
  active: 'פעיל', onboarding: 'בקליטה', candidate: 'מועמד', on_leave: 'בחופשה', terminated: 'סיום העסקה',
};

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  catch { return String(d).slice(0, 10); }
}
function posNames(positions) {
  if (!Array.isArray(positions)) return [];
  return positions.map((p) => (typeof p === 'string' ? p : (p?.position_name || p?.name || ''))).filter(Boolean);
}

function MyCardInner() {
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(null); // message when login isn't tied to an employee
  const [emp, setEmp] = useState(null);
  const [crm, setCrm] = useState(null);
  const [shifts, setShifts] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await base44.functions.getMyEmployeeCard({});
        const res = r?.data || r;
        if (!alive) return;
        if (!res?.found) { setNotLinked(res?.message || 'לא נמצא כרטיס עובד מקושר.'); setLoading(false); return; }
        setEmp(res.employee);
        const id = res.employee.id;
        const [crmR, shR] = await Promise.all([
          base44.functions.getEmployeeCRM({ employee_id: id }).then((x) => x?.data || x).catch(() => null),
          base44.functions.getEmployeeShiftHistory({ employee_id: id }).then((x) => x?.data || x).catch(() => null),
        ]);
        if (!alive) return;
        setCrm(crmR);
        setShifts(Array.isArray(shR?.shifts) ? shR.shifts : []);
      } catch { if (alive) setNotLinked('שגיאה בטעינת הכרטיס.'); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  if (notLinked) {
    return (
      <div className="max-w-md mx-auto mt-10 text-center p-6" dir="rtl">
        <AlertCircle className="w-10 h-10 mx-auto text-amber-500 mb-3" />
        <p className="text-slate-700">{notLinked}</p>
      </div>
    );
  }

  const positions = posNames(emp?.positions);
  const onboarding = Array.isArray(crm?.onboarding) ? crm.onboarding : [];
  const documents = Array.isArray(crm?.documents) ? crm.documents : [];
  const onbDone = onboarding.filter((s) => s.done).length;
  const recentShifts = shifts.slice(0, 12);

  return (
    <div className="max-w-2xl mx-auto p-3 sm:p-5 space-y-4" dir="rtl">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-l from-[#44512C] to-[#5c6b3a] text-white p-5 shadow">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold">
            {(emp?.full_name || '?').slice(0, 1)}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">{emp?.full_name}</h1>
            <div className="text-sm text-white/80 flex flex-wrap items-center gap-2 mt-0.5">
              {emp?.department && <span>{emp.department}</span>}
              <Badge className="bg-white/25 text-white hover:bg-white/25 text-xs">{STATUS_HE[emp?.status] || emp?.status || 'עובד'}</Badge>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
          {emp?.phone && <div className="bg-white/10 rounded-lg px-3 py-2"><div className="text-white/60 text-xs">טלפון</div><div dir="ltr" className="text-left">{emp.phone}</div></div>}
          <div className="bg-white/10 rounded-lg px-3 py-2"><div className="text-white/60 text-xs">תאריך תחילת עבודה</div><div>{fmtDate(emp?.hire_date)}</div></div>
        </div>
        {positions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {positions.map((p) => <span key={p} className="text-xs bg-white/15 rounded-full px-2.5 py-1">{p}</span>)}
          </div>
        )}
      </div>

      {/* Onboarding progress */}
      {onboarding.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#44512C]" /> תהליך קליטה ({onbDone}/{onboarding.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {onboarding.map((s) => (
                <div key={s.step_key} className="flex items-center gap-2 text-sm">
                  {s.done ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <Circle className="w-4 h-4 text-slate-300 shrink-0" />}
                  <span className={s.done ? 'text-slate-700' : 'text-slate-500'}>{s.label}</span>
                  {s.done && s.done_at && <span className="text-xs text-slate-400 mr-auto">{fmtDate(s.done_at)}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Documents */}
      {documents.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4 text-[#44512C]" /> מסמכים ({documents.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {documents.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{d.doc_type || d.name || 'מסמך'}</span>
                  {d.file_url ? <a href={d.file_url} target="_blank" rel="noreferrer" className="text-blue-600 text-xs shrink-0">פתח</a> : <span className="text-slate-400 text-xs">—</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent shifts */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="w-4 h-4 text-[#44512C]" /> המשמרות שלי</CardTitle></CardHeader>
        <CardContent>
          {recentShifts.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-3">אין משמרות להצגה.</p>
          ) : (
            <div className="space-y-1">
              {recentShifts.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-sm border-b border-slate-100 pb-1">
                  <span className="font-medium">{fmtDate(s.date)}</span>
                  <span className="text-slate-600 text-xs" dir="ltr">
                    {s.actual_start || s.scheduled_start || '—'}{(s.actual_end || s.scheduled_end) ? `–${s.actual_end || s.scheduled_end}` : ''}
                  </span>
                  {s.late_minutes > 0
                    ? <Badge className="bg-red-100 text-red-700 text-[11px]"><Clock className="w-3 h-3 ml-0.5" />איחר {s.late_minutes}′</Badge>
                    : <Badge className="bg-emerald-50 text-emerald-700 text-[11px]">בזמן</Badge>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-[11px] text-slate-400">הכרטיס לצפייה בלבד. לעדכון פרטים פנה/י למנהל.</p>
    </div>
  );
}

export default function MyCardPage() {
  return <PageGuard pageName="MyCard"><MyCardInner /></PageGuard>;
}
