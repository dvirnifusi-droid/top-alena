// WhatsApp reply handler for the daily staff-hours report.
// After the report is sent, the owner can reply on WhatsApp:
//   • "מאושר" / "אישור" / "👍"        → mark the report approved.
//   • "דני 6 שעות" / "מיכל 8.5"        → correct that employee's hours; the fix
//                                        is written straight to ShiftTracking, so
//                                        the schedule / labor-cost "actual" update.
// Multiple corrections in one message are supported (comma- or line-separated).
//
// Tightly gated: only engages when a report snapshot exists AND was sent in the
// last 18h AND the text is an approval token or parses as a name+hours pair.
// Anything else returns null so the normal admin-agent flow proceeds.
import { prisma } from '../db.js';

const db = prisma as any;
const RECENT_MS = 18 * 3600 * 1000;

const APPROVE_RE = /^(מאושר|מאשר|אישור|אושר|מ?אשרת|ok|okay|👍|✅|✓|✔️?|סבבה|מעולה|תודה|קיבלתי)[\s!.]*$/i;

// Pull "<name> <hours>" pairs out of a free-text correction. A segment must have
// a Hebrew/word token and a number; "8 במקום 10" takes the first number (8).
function parseCorrections(text: string): Array<{ name: string; hours: number }> {
  const out: Array<{ name: string; hours: number }> = [];
  const segments = String(text).split(/[\n,;]+|\bו-|(?<=\d)\s+ו\s+/).map(s => s.trim()).filter(Boolean);
  for (const seg of segments) {
    const numMatch = seg.match(/(\d+(?:[.,]\d+)?)/);
    if (!numMatch) continue;
    const hours = parseFloat(numMatch[1].replace(',', '.'));
    if (!(hours >= 0) || hours > 24) continue;
    // Name = the segment minus the number and filler words.
    const name = seg
      .replace(numMatch[0], ' ')
      .replace(/שע(ות|'|ה)?|שעה|hours?|hrs?|במקום|של|ל-|:|=|-/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (name.length >= 2) out.push({ name, hours });
  }
  return out;
}

// Israel-day UTC midnight for the snapshot date (fallback shift date when we
// need to CREATE a tracking row for a scheduled-but-missing employee).
function snapshotDate(snap: any): Date {
  const iso = snap?.at || snap?.since;
  const d = iso ? new Date(iso) : new Date();
  const ymd = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  return new Date(`${ymd}T00:00:00.000Z`);
}

export async function tryHandleDailyHoursReply(fromPhone: string, body: string): Promise<string | null> {
  try {
    return await handleDailyHoursReplyInner(fromPhone, body);
  } catch (e: any) {
    // Bulletproof: this runs on EVERY admin message before the normal agent, so
    // it must never throw and silence the agent. Any error → fall through.
    console.warn('[daily-hours-reply] non-fatal error, falling through', e?.message);
    return null;
  }
}

async function handleDailyHoursReplyInner(fromPhone: string, body: string): Promise<string | null> {
  const text = String(body || '').trim();
  if (!text) return null;

  const profile = await db.restaurantProfile.findFirst().catch(() => null);
  const snap = profile?.daily_hours_report_snapshot;
  if (!snap?.rows || !Array.isArray(snap.rows)) return null;
  const sentAt = snap.at ? new Date(snap.at).getTime() : 0;
  if (!sentAt || Date.now() - sentAt > RECENT_MS) return null; // stale — not a reply to a live report

  // ── Approval ──
  if (APPROVE_RE.test(text)) {
    if (profile?.id) {
      await db.restaurantProfile.update({
        where: { id: profile.id },
        data: { daily_hours_report_snapshot: { ...snap, approved_at: new Date().toISOString() } },
      }).catch(() => {});
    }
    const flagged = (snap.rows as any[]).filter(r => r.flags?.length).length;
    return `✅ *דוח השעות אושר.* תודה!${flagged ? `\n(נשארו ${flagged} חריגים מסומנים — אפשר לתקן בכל רגע: "שם + שעות".)` : ''}`;
  }

  // ── Corrections ──
  const corrections = parseCorrections(text);
  if (!corrections.length) return null; // not an approval, not a correction → let normal flow handle it

  const rows: any[] = snap.rows;
  const applied: string[] = [];
  const problems: string[] = [];

  for (const c of corrections) {
    const matches = rows.filter(r => String(r.name || '').includes(c.name) || c.name.includes(String(r.name || '').split(' ')[0]));
    if (matches.length === 0) { problems.push(`"${c.name}" — לא בדוח`); continue; }
    if (matches.length > 1) { problems.push(`"${c.name}" — יותר מאחד (${matches.map(m => m.name).join(', ')})`); continue; }
    const row = matches[0];
    const eff = Math.round(c.hours * 100) / 100;
    try {
      if (row.tracking_id) {
        await db.shiftTracking.update({
          where: { id: row.tracking_id },
          data: { total_hours: eff, effective_hours: eff, status: 'completed', source: 'manual', updatedAt: new Date() },
        });
      } else {
        // Scheduled-but-missing → create the actual-hours row now.
        const created = await db.shiftTracking.create({
          data: {
            employee_id: row.employee_id, employee_name: row.name, date: snapshotDate(snap),
            shift_start: snapshotDate(snap), status: 'completed',
            total_hours: eff, effective_hours: eff, source: 'manual', shift_type: row.shift_type || null,
          },
        });
        row.tracking_id = created.id;
      }
      row.hours = eff;
      row.flags = eff >= 10 ? ['long'] : [];
      applied.push(`${row.name} → ${eff} שע'`);
    } catch (e: any) {
      problems.push(`${row.name} — שגיאה בעדכון`);
    }
  }

  // Persist the updated snapshot so further corrections stack correctly.
  if (profile?.id && applied.length) {
    await db.restaurantProfile.update({
      where: { id: profile.id },
      data: { daily_hours_report_snapshot: { ...snap, rows } },
    }).catch(() => {});
  }

  // Only claim the message if we actually applied a correction. If nothing
  // matched a report employee, fall through so a normal admin command that just
  // happens to contain a number (e.g. "כמה הזמנות ל-19:00") reaches the agent.
  if (!applied.length) return null;
  const lines: string[] = [`✅ *עודכן:* ${applied.join(' · ')}`];
  if (problems.length) lines.push(`⚠️ ${problems.join(' · ')}`);
  lines.push('_העדכון נכנס לסידור ולעלות העבודה._');
  return lines.join('\n');
}
