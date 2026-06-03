import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Calendar, Briefcase } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { he } from 'date-fns/locale';

// Shows the employee's next upcoming WorkShift assignment, with a live
// countdown. Searches today + next 6 days. Refreshes every 60 seconds.
//
// States:
//   - assignment starts in the future → big countdown + clock-in CTA hint
//   - assignment started in the last 6h, employee not clocked-in → urgent red
//   - assignment fully in the past for today → "המשמרת היום הסתיימה"
//   - nothing in next 7 days → "אין משמרת מתוכננת"

const SHIFT_LABEL = {
  lunch: '☀️ צהריים',
  dinner: '🌙 ערב',
};

function parseHHmm(timeStr, baseDate) {
  if (!timeStr) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(timeStr));
  if (!m) return null;
  const d = new Date(baseDate);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

function formatHebrewWeekday(date) {
  // date-fns 'EEEE' with he locale produces "יום שלישי" etc.
  return format(date, 'EEEE', { locale: he });
}

export default function NextShiftCountdown({ currentEmployee, user }) {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

  const targetName = (currentEmployee?.full_name || user?.full_name || '').trim().toLowerCase();
  const targetId = currentEmployee?.id || user?.id || null;

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const today = format(new Date(), 'yyyy-MM-dd');
        const horizon = format(addDays(new Date(), 7), 'yyyy-MM-dd');
        const all = await base44.entities.WorkShift.list('-date', 60);
        const myShifts = [];
        for (const ws of all || []) {
          const dateStr = String(ws.date || '').slice(0, 10);
          if (dateStr < today || dateStr > horizon) continue;
          const assignment = (ws.assigned_staff || []).find((a) => {
            if (!a) return false;
            if (a.employee_id && targetId && a.employee_id === targetId) return true;
            const an = String(a.employee_name || '').trim().toLowerCase();
            return an && targetName && an === targetName;
          });
          if (!assignment) continue;
          myShifts.push({
            date: dateStr,
            shift_type: ws.shift_type,
            start_time: assignment.start_time || ws.start_time,
            end_time: assignment.end_time || ws.end_time,
            position: assignment.position || 'עובד',
          });
        }
        myShifts.sort((a, b) =>
          a.date === b.date
            ? String(a.start_time || '').localeCompare(String(b.start_time || ''))
            : a.date.localeCompare(b.date),
        );
        setShifts(myShifts);
      } catch (e) {
        console.warn('NextShiftCountdown load failed', e);
      } finally {
        setLoading(false);
      }
    };
    if (targetName || targetId) load();
  }, [targetName, targetId]);

  const next = useMemo(() => {
    for (const s of shifts) {
      const d = new Date(s.date + 'T00:00:00');
      const startAt = parseHHmm(s.start_time, d);
      const endAt = parseHHmm(s.end_time, d);
      if (!startAt) continue;
      // Still in the future, OR started recently and hasn't ended
      if (startAt > now) return { ...s, startAt, endAt, phase: 'future' };
      if (endAt && endAt > now) return { ...s, startAt, endAt, phase: 'active' };
    }
    return null;
  }, [shifts, now]);

  if (loading) return null;

  if (!next) {
    return (
      <Card className="mb-4 border-2 border-slate-200">
        <CardContent className="p-4 flex items-center gap-3 text-slate-500">
          <Calendar className="w-5 h-5" />
          <span className="text-sm">אין משמרת מתוכננת בשבוע הקרוב</span>
        </CardContent>
      </Card>
    );
  }

  const isActive = next.phase === 'active';
  const diffMs = next.startAt.getTime() - now.getTime();
  const isToday = next.date === format(now, 'yyyy-MM-dd');
  const isTomorrow = next.date === format(addDays(now, 1), 'yyyy-MM-dd');
  const weekdayLabel = isToday ? 'היום' : isTomorrow ? 'מחר' : formatHebrewWeekday(next.startAt);

  // Format countdown (only when shift is in the future)
  let countdownText = '';
  if (!isActive && diffMs > 0) {
    const totalMin = Math.floor(diffMs / 60000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    if (days > 0) countdownText = `בעוד ${days} ימים ו-${hours} שעות`;
    else if (hours > 0) countdownText = `בעוד ${hours} שעות ${mins} דקות`;
    else if (mins > 5) countdownText = `בעוד ${mins} דקות`;
    else countdownText = `מתחילה כעת! ⚡`;
  }

  const accent = isActive
    ? 'border-red-300 bg-gradient-to-l from-red-50 to-orange-50'
    : isToday
      ? 'border-emerald-300 bg-gradient-to-l from-emerald-50 to-cyan-50'
      : 'border-indigo-300 bg-gradient-to-l from-indigo-50 to-violet-50';

  return (
    <Card className={`mb-4 border-2 ${accent} shadow-sm`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/70 flex items-center justify-center shadow">
              <Clock className={`w-6 h-6 ${isActive ? 'text-red-600 animate-pulse' : 'text-indigo-600'}`} />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-bold">
                {isActive ? 'המשמרת שלך פעילה כעת' : 'המשמרת הבאה שלך'}
              </p>
              <p className="text-lg font-black text-slate-800 leading-tight">
                {weekdayLabel} · {format(next.startAt, 'dd/MM')}
                <span className="mx-2 text-slate-400">·</span>
                {next.start_time}{next.end_time ? `-${next.end_time}` : ''}
              </p>
              <div className="flex gap-2 mt-1 items-center">
                <Badge variant="outline" className="text-[11px]">
                  <Briefcase className="w-3 h-3 ml-1" />
                  {next.position}
                </Badge>
                <Badge variant="secondary" className="text-[11px]">
                  {SHIFT_LABEL[next.shift_type] || next.shift_type}
                </Badge>
              </div>
            </div>
          </div>
          <div className="text-right">
            {isActive ? (
              <p className="text-sm font-black text-red-700">
                ⚡ עוד לא הוחתמת — לחץ "כניסה למשמרת" למעלה
              </p>
            ) : (
              <p className="text-sm font-black text-indigo-700">{countdownText}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
