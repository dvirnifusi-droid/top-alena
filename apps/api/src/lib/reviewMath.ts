// Pure helpers for "how many 5-star reviews to reach a target Google rating".
// Google displays ratings rounded to 1 decimal, so a displayed target is
// reached when the true average >= target - 0.05.

export function reviewsToTarget(avg: number, count: number, target: number): number | null {
  if (!(count >= 0) || !(avg >= 0)) return 0;
  if (target >= 5) return null; // a perfect 5.0 display is not a realistic goal
  const T = target - 0.05;
  if (avg >= T) return 0; // already displays >= target
  const x = Math.ceil((count * (T - avg)) / (5 - T));
  return Math.max(0, x);
}

export function nextMilestones(avg: number, count: number): Array<{ target: number; reviews: number }> {
  const out: Array<{ target: number; reviews: number }> = [];
  // start at the next 0.1 above the current displayed value
  let t = Math.round(avg * 10) / 10 + 0.1;
  t = Math.round(t * 10) / 10;
  while (t <= 4.9 + 1e-9) {
    const reviews = reviewsToTarget(avg, count, t);
    if (reviews !== null) out.push({ target: Math.round(t * 10) / 10, reviews });
    t = Math.round((t + 0.1) * 10) / 10;
  }
  return out;
}
