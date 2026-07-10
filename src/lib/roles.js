// Single source of truth for role-name normalization. Employees often submit a
// feminine role ("מלצרית"/"טבחית"/"ברמנית"...) but the schedule works in the
// canonical (masculine/neutral) name. Normalizing on WRITE keeps the stored data
// clean so it matches everywhere — not just at display time.
export const POSITION_ALIASES = {
  'מלצרית': 'מלצר', 'ברמנית': 'ברמן', 'ראנרית': 'ראנר',
  'מארחת': 'מארח/ת', 'מארח': 'מארח/ת',
  'מנהלת משמרת': 'מנהל משמרת',
  'טבחית': 'טבח',
  'שוטפת כלים': 'שוטף כלים',
  'מתלמדת פלור': 'מתלמד פלור',
  'מתלמדת מטבח': 'מתלמד מטבח',
  'מנהלת פלור': 'מנהל פלור',
  'מנהלת מטבח': 'מנהל מטבח',
  'קופה ואריזות': 'קופה + אריזות',
  'קופה +אריזות': 'קופה + אריזות',
};

// Map one role name to its canonical form (identity if unknown).
export const canonRole = (p) => POSITION_ALIASES[String(p || '').trim()] || String(p || '').trim();

// Normalize an array of role names (drops empties, de-dupes).
export const canonRoles = (arr) => {
  const out = [];
  const seen = new Set();
  for (const p of (Array.isArray(arr) ? arr : [])) {
    const c = canonRole(p);
    if (c && !seen.has(c)) { seen.add(c); out.push(c); }
  }
  return out;
};
