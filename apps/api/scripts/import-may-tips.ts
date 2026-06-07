// One-shot import of late-May 2026 tip reports from the legacy base44 app.
// Reads structured data parsed from owner's screenshots and writes TipReport
// rows for 25, 26, 28, 30 (locked, real data) and 31 (calculated at ₪40/hr
// because the legacy report was never locked).
//
// Re-runnable: each date+shift is upserted via findFirst+update/create.

import { prisma } from '../src/db.js';

const SHIFT = 'dinner';
const NOTE_PREFIX = 'יובא מבסיס44 (אפליקציה ישנה) ב-7/6/26';
const MINIMUM_HOURLY = 40; // owner's instruction for unlocked days

type Staff = {
  name: string;
  position: string;
  start: string; // 'HH:MM'
  end: string;   // 'HH:MM'
  breakMin: number;
  effectiveHours: number;
  mealCost: number;
  gross: number;
  net: number;
  supplement?: number;
};

type ReportInput = {
  date: string; // 'YYYY-MM-DD'
  totalTips: number;
  poolForDistribution: number;
  restaurantCut: number;
  runnerCut: number;
  tipPerHour: number;
  waiterHours: number;
  runnerHours: number;
  staff: Staff[];
  status: 'locked' | 'draft';
  note?: string;
};

const reports: ReportInput[] = [
  {
    date: '2026-05-25',
    totalTips: 870,
    poolForDistribution: 824.45,
    restaurantCut: 45.55,
    runnerCut: 0,
    tipPerHour: 54.30,
    waiterHours: 15.18,
    runnerHours: 0,
    status: 'locked',
    staff: [
      { name: 'עופרי ענתבי',  position: 'מלצר', start: '17:00', end: '00:35', breakMin: 0,  effectiveHours: 7.58, mealCost: 15, gross: 411.77, net: 396.77 },
      { name: 'הילה מאסיל',   position: 'מלצר', start: '19:31', end: '23:32', breakMin: 0,  effectiveHours: 4.02, mealCost: 15, gross: 218.10, net: 203.10 },
      { name: 'אסתר בוסקילה', position: 'מלצר', start: '21:10', end: '22:15', breakMin: 0,  effectiveHours: 1.08, mealCost: 0,  gross: 58.82,  net: 58.82  },
      { name: 'נירית לוי',    position: 'מלצר', start: '22:15', end: '00:45', breakMin: 0,  effectiveHours: 2.50, mealCost: 15, gross: 135.75, net: 120.75 },
    ],
  },
  {
    date: '2026-05-26',
    totalTips: 1424,
    poolForDistribution: 1269.65,
    restaurantCut: 64.35,
    runnerCut: 90,
    tipPerHour: 66.13,
    waiterHours: 19.20,
    runnerHours: 2.25,
    status: 'locked',
    staff: [
      { name: 'הילה מאסיל',  position: 'מלצר', start: '20:15', end: '00:40', breakMin: 0,  effectiveHours: 4.42, mealCost: 0, gross: 292.06, net: 292.06 },
      { name: 'עדן ניפוסי',   position: 'מלצר', start: '18:00', end: '23:55', breakMin: 45, effectiveHours: 5.17, mealCost: 0, gross: 341.66, net: 341.66 },
      { name: 'איה לוי',      position: 'מלצר', start: '22:30', end: '00:30', breakMin: 0,  effectiveHours: 2.00, mealCost: 0, gross: 132.26, net: 132.26 },
      { name: 'עופרי ענתבי',  position: 'מלצר', start: '17:03', end: '00:40', breakMin: 0,  effectiveHours: 7.62, mealCost: 0, gross: 503.67, net: 503.67 },
      { name: 'איה לוי',      position: 'ראנר', start: '20:15', end: '22:30', breakMin: 0,  effectiveHours: 2.25, mealCost: 0, gross: 90.00,  net: 90.00  },
    ],
  },
  {
    date: '2026-05-28',
    totalTips: 4721,
    poolForDistribution: 4255.35,
    restaurantCut: 175.65,
    runnerCut: 290,
    tipPerHour: 82.95,
    waiterHours: 51.30,
    runnerHours: 7.25,
    status: 'locked',
    staff: [
      { name: 'דניאל תנו',    position: 'מלצר', start: '21:38', end: '01:13', breakMin: 0,  effectiveHours: 3.58, mealCost: 0, gross: 297.24, net: 297.24 },
      { name: 'עופרי ענתבי',  position: 'מלצר', start: '17:01', end: '02:05', breakMin: 0,  effectiveHours: 9.07, mealCost: 0, gross: 752.08, net: 752.08 },
      { name: 'הילה מאסיל',   position: 'מלצר', start: '18:39', end: '02:45', breakMin: 0,  effectiveHours: 8.10, mealCost: 0, gross: 671.90, net: 671.90 },
      { name: 'עדן ניפוסי',   position: 'מלצר', start: '18:29', end: '01:14', breakMin: 0,  effectiveHours: 6.75, mealCost: 0, gross: 559.91, net: 559.91 },
      { name: 'יהלי דסקלו',   position: 'מלצר', start: '20:00', end: '01:20', breakMin: 0,  effectiveHours: 5.33, mealCost: 0, gross: 442.40, net: 442.40 },
      { name: 'זיו אליעוד',   position: 'מלצר', start: '21:01', end: '01:39', breakMin: 0,  effectiveHours: 4.63, mealCost: 0, gross: 384.34, net: 384.34 },
      { name: 'איה לוי',      position: 'מלצר', start: '19:10', end: '01:55', breakMin: 0,  effectiveHours: 4.75, mealCost: 0, gross: 394.01, net: 394.01 },
      { name: 'לאה תורנן',    position: 'מלצר', start: '21:00', end: '02:45', breakMin: 0,  effectiveHours: 5.75, mealCost: 0, gross: 476.96, net: 476.96 },
      { name: 'גל לוי',       position: 'ראנר', start: '19:00', end: '01:25', breakMin: 0,  effectiveHours: 4.25, mealCost: 0, gross: 170.00, net: 170.00 },
      { name: 'הדס',          position: 'ראנר', start: '21:12', end: '00:12', breakMin: 0,  effectiveHours: 3.00, mealCost: 0, gross: 120.00, net: 120.00 },
      { name: 'רועי מזרחי',   position: 'ראנר', start: '19:50', end: '01:10', breakMin: 15, effectiveHours: 3.33, mealCost: 15, gross: 276.50, net: 261.50 },
    ],
  },
  {
    date: '2026-05-30',
    totalTips: 1784,
    poolForDistribution: 1720.35,
    restaurantCut: 63.65,
    runnerCut: 0,
    tipPerHour: 81.08,
    waiterHours: 21.22,
    runnerHours: 0,
    status: 'locked',
    staff: [
      { name: 'דניאל תנו',    position: 'מלצר', start: '20:22', end: '00:25', breakMin: 15, effectiveHours: 3.80, mealCost: 15, gross: 308.12, net: 293.12 },
      { name: 'עופרי ענתבי',  position: 'מלצר', start: '20:30', end: '02:20', breakMin: 0,  effectiveHours: 6.00, mealCost: 0,  gross: 486.51, net: 486.51 },
      { name: 'הילה מאסיל',   position: 'מלצר', start: '20:30', end: '01:15', breakMin: 15, effectiveHours: 4.92, mealCost: 15, gross: 398.67, net: 383.67 },
      { name: 'עדן ניפוסי',   position: 'מלצר', start: '22:34', end: '00:34', breakMin: 0,  effectiveHours: 2.00, mealCost: 0,  gross: 162.17, net: 162.17 },
      { name: 'איה לוי',      position: 'מלצר', start: '21:40', end: '02:20', breakMin: 15, effectiveHours: 4.50, mealCost: 10, gross: 364.88, net: 349.88 },
    ],
  },
  // 31/5 — owner instructed: tips were never locked in legacy app, pay each
  // waiter ₪40/hr based on effective hours. Stored as locked here so it shows
  // up cleanly in salary calculations.
  {
    date: '2026-05-31',
    totalTips: 0,
    poolForDistribution: 0,
    restaurantCut: 0,
    runnerCut: 0,
    tipPerHour: MINIMUM_HOURLY,
    waiterHours: 24.75, // sum of effective_hours below
    runnerHours: 0,
    status: 'locked',
    note: 'דוח טיפים לא ננעל במערכת הישנה. שולם ₪40/שעה לפי הנחיית הבעלים.',
    staff: [
      { name: 'אורח / זמני',   position: 'מלצר', start: '17:00', end: '23:11', breakMin: 0,  effectiveHours: 6.00, mealCost: 0, gross: 240.00, net: 240.00, supplement: 240.00 },
      { name: 'זיו אליעוד',   position: 'מלצר', start: '22:30', end: '00:22', breakMin: 0,  effectiveHours: 1.87, mealCost: 0, gross: 74.80,  net: 74.80,  supplement: 74.80  },
      { name: 'איה לוי',      position: 'מלצר', start: '19:40', end: '00:07', breakMin: 0,  effectiveHours: 4.45, mealCost: 0, gross: 178.00, net: 178.00, supplement: 178.00 },
      { name: 'הילה מאסיל',   position: 'מלצר', start: '17:00', end: '00:23', breakMin: 0,  effectiveHours: 7.38, mealCost: 0, gross: 295.20, net: 295.20, supplement: 295.20 },
      { name: 'עדן ניפוסי',   position: 'מלצר', start: '19:09', end: '00:12', breakMin: 0,  effectiveHours: 5.05, mealCost: 0, gross: 202.00, net: 202.00, supplement: 202.00 },
    ],
  },
];

async function main() {
  let created = 0, updated = 0;
  for (const r of reports) {
    const dateObj = new Date(r.date + 'T18:00:00+03:00');
    const staffDetails = r.staff.map(s => ({
      employee_id: '',
      employee_name: s.name,
      position: s.position,
      start_time: s.start,
      end_time: s.end,
      break_minutes: s.breakMin || 0,
      meal_cost: s.mealCost || 0,
      sales_bonus: 0,
      total_hours: s.effectiveHours + (s.breakMin || 0) / 60,
      effective_hours: s.effectiveHours,
      hourly_deduction: 0,
      gross_tip: s.gross,
      final_tip: s.net,
      supplement: s.supplement ?? 0,
      total_earnings: s.net + (s.supplement ?? 0),
      employee_signature: null,
    }));
    const existing = await (prisma as any).tipReport.findFirst({
      where: { date: dateObj, shift_type: SHIFT },
    });
    const data: any = {
      date: dateObj,
      total_tips_collected: r.totalTips,
      net_tips_for_distribution: r.poolForDistribution,
      restaurant_deduction: r.restaurantCut,
      runner_deduction: r.runnerCut,
      tip_per_hour: r.tipPerHour,
      total_meal_amount: r.staff.reduce((s, x) => s + (x.mealCost || 0), 0),
      staff_details: staffDetails,
      shift_type: SHIFT,
      status: r.status,
      notes: r.note ? `${NOTE_PREFIX}. ${r.note}` : NOTE_PREFIX,
      locked_by: r.status === 'locked' ? 'import_legacy' : null,
      locked_at: r.status === 'locked' ? new Date() : null,
    };
    if (existing) {
      await (prisma as any).tipReport.update({ where: { id: existing.id }, data });
      console.log(`UPDATED ${r.date} (${r.staff.length} staff, ₪${r.totalTips})`);
      updated++;
    } else {
      await (prisma as any).tipReport.create({ data });
      console.log(`CREATED ${r.date} (${r.staff.length} staff, ₪${r.totalTips})`);
      created++;
    }
  }
  console.log(`\nSummary: ${created} created, ${updated} updated, ${reports.length} total`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
