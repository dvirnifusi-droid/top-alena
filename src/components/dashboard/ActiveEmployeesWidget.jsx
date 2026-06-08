import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { Clock, User, MessageCircle, AlertTriangle, Coffee } from 'lucide-react';

// Detect dept from positions array / role / explicit department field.
const KITCHEN_HINTS = ['מטבח', 'טבח', 'גריל', 'גרילמן', 'סלטים', 'שטיפה', 'עמדת מטבח'];
const BAR_HINTS = ['בר', 'ברמן', 'ברמנית', 'בריסטה'];
const FLOOR_HINTS = ['פלור', 'מלצר', 'מלצרית', 'מארח', 'מארחת', 'מנהל משמרת', 'ראנר', 'אחמש', 'מקשר'];

function detectDept(emp) {
  if (emp?.department) {
    const d = String(emp.department).toLowerCase();
    if (d.includes('kitchen') || d.includes('מטבח')) return 'kitchen';
    if (d.includes('bar') || d.includes('בר')) return 'bar';
    if (d.includes('floor') || d.includes('פלור')) return 'floor';
  }
  const positions = Array.isArray(emp?.positions) ? emp.positions : [];
  const all = [emp?.role, ...positions.map((p) => (typeof p === 'string' ? p : p?.position_name || p?.name))].filter(Boolean);
  for (const p of all) {
    const s = String(p);
    if (KITCHEN_HINTS.some((h) => s.includes(h))) return 'kitchen';
    if (BAR_HINTS.some((h) => s.includes(h))) return 'bar';
    if (FLOOR_HINTS.some((h) => s.includes(h))) return 'floor';
  }
  return 'unknown';
}

function formatDuration(ms) {
  if (!ms || ms < 0) return '0:00';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function normalizePhoneIL(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return '972' + digits.slice(1);
  return digits;
}

const DEPT_LABEL = {
  kitchen: { label: '🍳 מטבח', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  floor: { label: '🍽️ פלור', color: 'bg-[#F4ECD8] text-[#44512C] border-[#D9BD83]' },
  bar: { label: '🍷 בר', color: 'bg-[#F4ECD8] text-[#7A3722] border-[#D9BD83]' },
  unknown: { label: '? לא מוגדר', color: 'bg-slate-100 text-slate-500 border-slate-300' },
};

export default function ActiveEmployeesWidget() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [now, setNow] = useState(() => new Date());

  // Tick every minute so durations update live.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const [shiftTracking, employees] = await Promise.all([
          base44.entities.ShiftTracking.filter({ date: today }),
          base44.entities.Employee.filter({ status: 'active' }).catch(() => []),
        ]);

        const byEmail = {}, byId = {};
        for (const e of employees || []) {
          if (e.email) byEmail[String(e.email).toLowerCase()] = e;
          if (e.id) byId[e.id] = e;
        }

        const looksLikeEmail = (s) => typeof s === 'string' && s.includes('@');

        const out = [];
        for (const tr of shiftTracking) {
          if (tr.status !== 'active' && tr.status !== 'on_break') continue;

          // Resolve real Employee record for the row
          const emp =
            byId[tr.employee_id] ||
            byEmail[String(tr.employee_name || '').toLowerCase()] ||
            null;

          let name = tr.employee_name;
          if (!name || looksLikeEmail(name)) {
            name = emp?.full_name || tr.employee_name || 'לא ידוע';
          }

          const dept = detectDept(emp);
          const position = emp?.role || (Array.isArray(emp?.positions) && emp.positions[0]) || tr.position || null;

          // Compute current break duration if on_break
          const breaks = Array.isArray(tr.breaks) ? tr.breaks : [];
          const lastBreak = breaks[breaks.length - 1];
          let currentBreakMin = 0;
          if (tr.status === 'on_break' && lastBreak && lastBreak.break_start && !lastBreak.break_end) {
            currentBreakMin = Math.round((Date.now() - new Date(lastBreak.break_start).getTime()) / 60000);
          }

          out.push({
            id: tr.id,
            name,
            phone: emp?.phone || null,
            position: typeof position === 'string' ? position : position?.position_name || position?.name || null,
            dept,
            shiftStart: tr.shift_start,
            status: tr.status,
            shiftType: tr.shift_type || 'general',
            totalBreakMinutes: Number(tr.total_break_minutes || 0),
            currentBreakMin,
          });
        }

        // Sort by clock-in time ascending (earliest first)
        out.sort((a, b) => new Date(a.shiftStart).getTime() - new Date(b.shiftStart).getTime());
        setRows(out);
      } catch (error) {
        console.error('Error loading active employees:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 30_000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'on_break') return rows.filter((r) => r.status === 'on_break');
    return rows.filter((r) => r.dept === filter);
  }, [rows, filter]);

  const counts = useMemo(() => ({
    all: rows.length,
    kitchen: rows.filter((r) => r.dept === 'kitchen').length,
    floor: rows.filter((r) => r.dept === 'floor').length,
    bar: rows.filter((r) => r.dept === 'bar').length,
    on_break: rows.filter((r) => r.status === 'on_break').length,
  }), [rows]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User className="w-5 h-5" />עובדים פעילים במשמרת</CardTitle>
        </CardHeader>
        <CardContent><p className="text-gray-600">טוען...</p></CardContent>
      </Card>
    );
  }

  const filterChips = [
    { key: 'all', label: 'הכל', count: counts.all, color: 'bg-slate-700 text-white' },
    { key: 'kitchen', label: '🍳 מטבח', count: counts.kitchen, color: 'bg-orange-500 text-white' },
    { key: 'floor', label: '🍽️ פלור', count: counts.floor, color: 'bg-[#44512C] text-white' },
    { key: 'bar', label: '🍷 בר', count: counts.bar, color: 'bg-[#A04A2E] text-white' },
    { key: 'on_break', label: '💤 בהפסקה', count: counts.on_break, color: 'bg-yellow-500 text-white' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5" />
            עובדים פעילים במשמרת
          </div>
          <Badge variant="secondary" className="text-lg">{rows.length}</Badge>
        </CardTitle>
        {/* Filter chips */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {filterChips.map((c) => {
            const active = filter === c.key;
            return (
              <button
                key={c.key}
                onClick={() => setFilter(c.key)}
                disabled={c.count === 0 && c.key !== 'all'}
                className={`text-xs px-2.5 py-1 rounded-full font-bold border-2 transition ${
                  active ? c.color + ' border-transparent' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                } ${c.count === 0 && c.key !== 'all' ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {c.label} · {c.count}
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-gray-500 text-sm py-4 text-center">אין עובדים בקטגוריה הזו</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((emp) => {
              const start = new Date(emp.shiftStart);
              const elapsedMs = now.getTime() - start.getTime();
              const elapsedH = elapsedMs / 3600000;
              const isOvertime = elapsedH > 8;
              const isCritical = elapsedH > 10;
              const onBreak = emp.status === 'on_break';
              const checkInTime = start.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
              const phone = normalizePhoneIL(emp.phone);
              const deptInfo = DEPT_LABEL[emp.dept];

              const cardClass = onBreak
                ? 'bg-[#FAF5E8] border-[#D9BD83]'
                : isCritical
                  ? 'bg-red-50 border-red-300'
                  : isOvertime
                    ? 'bg-orange-50 border-orange-300'
                    : 'bg-green-50 border-green-200';
              const statusDot = onBreak ? 'bg-yellow-500' : 'bg-green-500 animate-pulse';

              return (
                <div
                  key={emp.id}
                  className={`relative flex items-center justify-between p-3 rounded-lg border-2 ${cardClass}`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full ${statusDot} flex-shrink-0`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800 truncate">{emp.name}</span>
                        <Badge variant="outline" className={`text-[10px] ${deptInfo.color}`}>
                          {deptInfo.label}
                        </Badge>
                        {emp.position && (
                          <span className="text-[11px] text-slate-500">· {emp.position}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {checkInTime}
                        </span>
                        <span className={`font-bold ${isCritical ? 'text-red-700' : isOvertime ? 'text-orange-700' : 'text-emerald-700'}`}>
                          ⏱️ {formatDuration(elapsedMs)}
                        </span>
                        {emp.totalBreakMinutes > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Coffee className="w-3 h-3" />
                            {emp.totalBreakMinutes} דק'
                          </span>
                        )}
                        {onBreak && emp.currentBreakMin > 0 && (
                          <span className="text-yellow-700 font-bold">
                            💤 {emp.currentBreakMin} דק' מההפסקה
                          </span>
                        )}
                        {isOvertime && !isCritical && (
                          <span className="flex items-center gap-0.5 text-orange-700 font-bold">
                            <AlertTriangle className="w-3 h-3" /> מעל 8 שעות
                          </span>
                        )}
                        {isCritical && (
                          <span className="flex items-center gap-0.5 text-red-700 font-bold">
                            <AlertTriangle className="w-3 h-3" /> חריגה! 10+ שעות
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {phone && (
                    <a
                      href={`https://wa.me/${phone}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 bg-green-500 hover:bg-green-600 text-white p-2 rounded-full shadow-sm flex-shrink-0"
                      title="שלח וואטסאפ"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
