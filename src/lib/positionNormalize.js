// Single source of truth for the position labels the schedule grid actually
// renders rows for, plus a feminine→masculine + spelling-variant normalizer.
// Both AvailabilityRequests (when WRITING assignments) and WorkScheduling
// (when FILTERING assignments for display) must agree on the canonical names
// — otherwise assignments save but don't appear in the schedule grid.

export const SCHEDULE_LUNCH_POSITIONS = [
  'קופה + אריזות', 'מלצר', 'חומוס', 'טבח', 'מתלמד פלור', 'בלתם',
];

export const SCHEDULE_DINNER_POSITIONS = [
  'מנהל משמרת', 'ברמן', 'מלצר', 'ראנר', 'מארח/ת', 'מתלמד פלור',
  'טבח', 'צאקר', 'גריל', 'פס בטטה', 'מקשר', 'מתלמד מטבח', 'שוטף כלים', 'בלתם',
];

// Feminine → masculine + spelling-variant fallback.
const POSITION_NORMALIZE = {
  'מלצרית': 'מלצר', 'ברמנית': 'ברמן', 'ראנרית': 'ראנר',
  'מארחת': 'מארח/ת', 'מארח': 'מארח/ת',
  'מנהלת משמרת': 'מנהל משמרת',
  'טבחית': 'טבח',
  'קונדיטורית': 'קונדיטור',
  'שוטפת כלים': 'שוטף כלים',
  'מתלמדת פלור': 'מתלמד פלור',
  'מתלמדת מטבח': 'מתלמד מטבח',
  'מנהלת פלור': 'מנהל פלור',
  'מנהלת מטבח': 'מנהל מטבח',
  'קופה ואריזות': 'קופה + אריזות',
  'קופה +אריזות': 'קופה + אריזות',
};

export function normalizePositionForSchedule(raw) {
  const s = String(raw || '').trim();
  return POSITION_NORMALIZE[s] || s;
}

// Pick the best position from a candidate list for a given shift type. Returns
// the first one (post-normalize) that's in the shift-appropriate schedule order
// list. Falls back to 'מלצר' so the assignment is never invisible.
export function pickSchedulablePosition(positions, shiftType) {
  const order = shiftType === 'lunch' ? SCHEDULE_LUNCH_POSITIONS : SCHEDULE_DINNER_POSITIONS;
  for (const p of (positions || [])) {
    const norm = normalizePositionForSchedule(p);
    if (order.includes(norm)) return norm;
  }
  return 'מלצר';
}
