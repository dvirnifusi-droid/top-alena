import { useState, useEffect } from 'react';

// Default widget configs per page
export const EMPLOYEE_WIDGETS = [
  { id: 'stories', label: 'סטוריז', emoji: '📸', defaultOn: true },
  { id: 'daily_challenge', label: 'אתגר יומי', emoji: '🎯', defaultOn: true },
  { id: 'shift_clock', label: 'שעון משמרת', emoji: '⏱️', defaultOn: true },
  { id: 'weekly_schedule', label: 'סידור עבודה שבועי', emoji: '📅', defaultOn: true },
  { id: 'assigned_tasks', label: 'משימות שמויכות', emoji: '✅', defaultOn: true },
  { id: 'daily_briefs', label: 'תדריכי היום', emoji: '📣', defaultOn: true },
  { id: 'delivery_button', label: 'כפתור הכנס משלוח', emoji: '📦', defaultOn: true },
  { id: 'smart_tools', label: 'כלי עבודה חכמים', emoji: '🤖', defaultOn: true },
  { id: 'quick_access', label: 'כרטיסי גישה מהירה', emoji: '🗂️', defaultOn: true },
];

export const ADMIN_WIDGETS = [
  { id: 'smart_tools', label: 'כלי עבודה חכמים', emoji: '🤖', defaultOn: true },
  { id: 'recruitment', label: 'דשבורד גיוס', emoji: '👥', defaultOn: true },
  { id: 'quick_stats', label: 'מבט מהיר - סטטיסטיקות', emoji: '📊', defaultOn: true },
  { id: 'user_guide', label: 'מדריך שימוש', emoji: '📖', defaultOn: true },
  { id: 'sales_chart', label: 'גרף מכירות', emoji: '📈', defaultOn: true },
  { id: 'active_employees', label: 'עובדים פעילים', emoji: '👤', defaultOn: true },
  { id: 'treats_report', label: 'דוח פינוקים', emoji: '🎁', defaultOn: true },
  { id: 'brief_readers', label: 'קוראי תדריכים', emoji: '📋', defaultOn: false },
  { id: 'recent_incidents', label: 'תקריות אחרונות', emoji: '⚠️', defaultOn: false },
  { id: 'checklist_status', label: 'סטטוס צ\'קליסטים', emoji: '☑️', defaultOn: false },
];

function getStorageKey(userEmail, page) {
  return `dashboard_layout_${page}_${userEmail || 'guest'}`;
}

export function useDashboardLayout(userEmail, page) {
  const widgets = page === 'employee' ? EMPLOYEE_WIDGETS : ADMIN_WIDGETS;
  const key = getStorageKey(userEmail, page);

  const [layout, setLayout] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        // merge with defaults to handle new widgets
        return widgets.map(w => ({
          ...w,
          enabled: parsed[w.id] !== undefined ? parsed[w.id] : w.defaultOn,
        }));
      }
    } catch {}
    return widgets.map(w => ({ ...w, enabled: w.defaultOn }));
  });

  // re-load when user changes
  useEffect(() => {
    if (!userEmail) return;
    const k = getStorageKey(userEmail, page);
    try {
      const saved = localStorage.getItem(k);
      if (saved) {
        const parsed = JSON.parse(saved);
        setLayout(widgets.map(w => ({
          ...w,
          enabled: parsed[w.id] !== undefined ? parsed[w.id] : w.defaultOn,
        })));
        return;
      }
    } catch {}
    setLayout(widgets.map(w => ({ ...w, enabled: w.defaultOn })));
  }, [userEmail]);

  const saveLayout = (newLayout) => {
    setLayout(newLayout);
    const toSave = {};
    newLayout.forEach(w => { toSave[w.id] = w.enabled; });
    localStorage.setItem(getStorageKey(userEmail, page), JSON.stringify(toSave));
  };

  const isVisible = (widgetId) => {
    const w = layout.find(x => x.id === widgetId);
    return w ? w.enabled : true;
  };

  return { layout, saveLayout, isVisible };
}