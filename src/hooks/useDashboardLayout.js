import { useState, useEffect } from 'react';

// Default widget configs per page
export const EMPLOYEE_WIDGETS = [
  { id: 'stories', label: 'סטוריז', emoji: '📸', defaultOn: true },
  { id: 'supervisor_panel', label: 'פאנל מפקח משמרת', emoji: '🎯', defaultOn: true },
  { id: 'sales_banner', label: 'הצוות מתחרה', emoji: '🔥', defaultOn: true },
  { id: 'shift_leaderboard', label: 'לוח המשמרת', emoji: '🏆', defaultOn: true },
  { id: 'weekly_goal', label: 'היעד השבועי שלי', emoji: '🎯', defaultOn: true },
  { id: 'reward_showcase', label: 'הפרסים שלי', emoji: '💎', defaultOn: true },
  { id: 'compact_coin', label: 'יתרת מטבעות', emoji: '💰', defaultOn: true },
  { id: 'daily_challenge', label: 'אתגר יומי', emoji: '🎯', defaultOn: true },
  { id: 'shift_clock', label: 'שעון משמרת', emoji: '⏱️', defaultOn: true },
  { id: 'next_shift', label: 'המשמרת הבאה שלי', emoji: '⏰', defaultOn: true },
  { id: 'weekly_schedule', label: 'סידור עבודה שבועי', emoji: '📅', defaultOn: true },
  { id: 'assigned_tasks', label: 'משימות משויכות', emoji: '✅', defaultOn: true },
  { id: 'daily_briefs', label: 'תדריכי היום', emoji: '📣', defaultOn: true },
  { id: 'delivery_button', label: 'כפתור הכנס משלוח', emoji: '📦', defaultOn: true },
  { id: 'smart_tools', label: 'כלי עבודה חכמים', emoji: '🤖', defaultOn: true },
  { id: 'quick_access', label: 'כרטיסי גישה מהירה', emoji: '🗂️', defaultOn: true },
  { id: 'my_tips', label: 'הטיפים שלי השבוע', emoji: '💰', defaultOn: false },
  { id: 'my_rank', label: 'הדירוג שלי', emoji: '🏆', defaultOn: false },
  { id: 'my_notifications', label: 'הודעות אחרונות', emoji: '🔔', defaultOn: false },
  { id: 'queue_status', label: 'תור נוכחי', emoji: '🎫', defaultOn: false },
];

export const ADMIN_WIDGETS = [
  { id: 'beecomm_live', label: 'Beecomm Live · קופה בזמן אמת', emoji: '🔴', defaultOn: true },
  { id: 'gomiley_live', label: 'Gomiley Live · משלוחים בזמן אמת', emoji: '🛵', defaultOn: true },
  { id: 'gomiley_dashboard', label: 'Gomiley לוח · KPI ופלטפורמות', emoji: '📊', defaultOn: true },
  { id: 'shift_insights', label: 'תובנות משמרת · דורש תשומת לב', emoji: '🎯', defaultOn: true },
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
  { id: 'today_tips', label: 'טיפים היום', emoji: '💰', defaultOn: true },
  { id: 'low_inventory', label: 'התראות מלאי', emoji: '📦', defaultOn: true },
  { id: 'active_deliveries', label: 'משלוחים פעילים', emoji: '🚚', defaultOn: false },
  { id: 'pending_requests', label: 'בקשות ממתינות', emoji: '🔔', defaultOn: true },
  { id: 'weekly_leaderboard', label: 'מובילי השבוע', emoji: '🏆', defaultOn: true },
  { id: 'queue_status', label: 'תור נוכחי', emoji: '🎫', defaultOn: false },
  { id: 'recent_feedback', label: 'סקרי לקוחות אחרונים', emoji: '📝', defaultOn: false },
  { id: 'today_reservations', label: 'הזמנות שולחנות היום', emoji: '📅', defaultOn: false },
  { id: 'weekly_performance', label: 'גרף ביצועים שבועי', emoji: '📊', defaultOn: false },
  { id: 'changelog', label: 'יומן שינויים (White Label)', emoji: '📋', defaultOn: true },
];

function getStorageKey(userEmail, page) {
  return `dashboard_layout_v2_${page}_${userEmail || 'guest'}`;
}

function buildLayout(widgets, saved) {
  // saved = [{id, enabled}] ordered list
  if (!saved || !Array.isArray(saved)) {
    return widgets.map(w => ({ ...w, enabled: w.defaultOn }));
  }
  // Start with saved order, then merge in NEW widgets at their canonical
  // position from the `widgets` array so a new defaultOn widget appears where
  // we want it (e.g. top of the list) instead of stranded at the bottom.
  const savedIds = new Set(saved.map(s => s.id));
  const ordered = saved
    .map(s => { const w = widgets.find(x => x.id === s.id); return w ? { ...w, enabled: s.enabled } : null; })
    .filter(Boolean);
  const result = [];
  let savedIdx = 0;
  for (const canon of widgets) {
    if (savedIds.has(canon.id)) {
      // Skip — it'll be placed by the saved-order walker below
      continue;
    }
    // New widget — insert it at the matching position in `ordered`. To keep
    // canonical order, walk `ordered` and place when we cross the next saved
    // widget that comes AFTER this one canonically.
    const canonIndex = widgets.findIndex(w => w.id === canon.id);
    // Find the first saved widget whose canonical index is > canonIndex
    let inserted = false;
    while (savedIdx < ordered.length) {
      const sIdx = widgets.findIndex(w => w.id === ordered[savedIdx].id);
      if (sIdx > canonIndex) {
        result.push({ ...canon, enabled: canon.defaultOn });
        inserted = true;
        break;
      }
      result.push(ordered[savedIdx]);
      savedIdx++;
    }
    if (!inserted) result.push({ ...canon, enabled: canon.defaultOn });
  }
  // Flush remaining saved widgets
  while (savedIdx < ordered.length) {
    result.push(ordered[savedIdx]);
    savedIdx++;
  }
  return result;
}

export function useDashboardLayout(userEmail, page) {
  const widgets = page === 'employee' ? EMPLOYEE_WIDGETS : ADMIN_WIDGETS;
  const key = getStorageKey(userEmail, page);

  const [layout, setLayout] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) return buildLayout(widgets, JSON.parse(saved));
    } catch {}
    return widgets.map(w => ({ ...w, enabled: w.defaultOn }));
  });

  useEffect(() => {
    if (!userEmail) return;
    try {
      const saved = localStorage.getItem(getStorageKey(userEmail, page));
      if (saved) { setLayout(buildLayout(widgets, JSON.parse(saved))); return; }
    } catch {}
    setLayout(widgets.map(w => ({ ...w, enabled: w.defaultOn })));
  }, [userEmail]);

  const saveLayout = (newLayout) => {
    setLayout(newLayout);
    const toSave = newLayout.map(w => ({ id: w.id, enabled: w.enabled }));
    localStorage.setItem(getStorageKey(userEmail, page), JSON.stringify(toSave));
  };

  const isVisible = (widgetId) => {
    const w = layout.find(x => x.id === widgetId);
    return w ? w.enabled : true;
  };

  return { layout, saveLayout, isVisible };
}