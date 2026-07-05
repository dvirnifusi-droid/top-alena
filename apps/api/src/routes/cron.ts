import type { FastifyPluginAsync } from 'fastify';
import { sendRestroomReminder, sendAbandonedReminder, sendT24SurveyReminders, runAutoTrackerAnalysis, runSalesAutoClose, runWeeklyPersonalGoals, captureBeecommSnapshot, backfillBeecommHistory, reopenAutoClosedShifts, runWeeklyScheduleOpen, runWeeklyScheduleReminder, runWeeklyScheduleFinalReminder, runWeeklyScheduleBuild, runNoShowWatcher, runInvoiceClassifier, runCrisisAgent, runContentGenerator, runCashFlowAgent } from '../functions/load.js';
import { sendMorningBrief, buildMorningBrief, sendEndOfDayBrief, buildEndOfDayBrief } from '../lib/morningBrief.js';
import { dispatchDueReminders } from '../lib/reminders.js';
import { sendWeeklyInsights, buildWeeklyInsights } from '../lib/weeklyInsights.js';
import { pullAllConnectedCalendars } from '../lib/googleSync.js';
import { scanEmailInvoices } from '../lib/emailInvoiceScan.js';
import { runInvoiceGapsDigest } from '../lib/invoiceGaps.js';

// Internal cron endpoints, guarded by a shared secret (x-cron-secret header or
// ?secret=). Called by the server crontab — never by end users.
export const cronRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const secret = process.env.CRON_SECRET;
    const provided =
      (req.headers['x-cron-secret'] as string) ||
      ((req.query as any)?.secret as string) ||
      '';
    if (!secret || provided !== secret) {
      return reply.code(403).send({ error: 'forbidden' });
    }
  });

  app.post('/restroom-reminder', async () => {
    return sendRestroomReminder();
  });

  app.post('/abandoned-reminder', async () => {
    return sendAbandonedReminder();
  });

  // Daily ~12:00 — WhatsApps yesterday's diners with a feedback link.
  // Existing CustomerSurvey page handles rating>3 → Google, rating<=3 → incident.
  app.post('/customer-survey-reminder', async () => {
    return sendT24SurveyReminders();
  });

  // Auto-tracker daily analysis — also runs from in-process timer at 23:00 IL,
  // exposed here so it can be triggered manually or via external scheduler.
  app.post('/auto-tracker', async () => {
    return runAutoTrackerAnalysis();
  });

  app.post('/sales-auto-close', async () => {
    return runSalesAutoClose();
  });

  app.post('/weekly-personal-goals', async () => {
    return runWeeklyPersonalGoals();
  });

  app.post('/beecomm-snapshot', async () => {
    return captureBeecommSnapshot();
  });

  app.post('/beecomm-backfill-daily', async () => {
    // Pull yesterday so today's Z (which just closed at 06:00 IL) is captured.
    return backfillBeecommHistory({ days: 2 });
  });

  // One-shot recovery endpoint — re-opens ShiftTracking rows that were
  // auto-closed in the last 36h. Triggered manually after the auto-close
  // paths were disabled (7/6/2026).
  app.post('/reopen-auto-closed-shifts', async (req) => {
    const maxAgeHours = Number((req.query as any)?.hours) || 36;
    return reopenAutoClosedShifts(maxAgeHours);
  });

  // Daily ~08:00 IL — send admin numbers a WhatsApp summary (sidur today,
  // tips yesterday, open leads, unpaid invoices, missing availability).
  app.post('/morning-brief', async () => {
    return sendMorningBrief();
  });

  // Preview/debug — return the brief text WITHOUT sending. Useful for
  // hand-testing what the brief will look like.
  app.post('/morning-brief-preview', async () => {
    const text = await buildMorningBrief();
    return { text };
  });

  // Every-minute tick — sends any reminder whose deliver_at is now-or-past.
  app.post('/dispatch-reminders', async () => {
    return dispatchDueReminders();
  });

  // Daily 23:30 IL — end-of-day summary (sales vs avg, tips, leads, incidents,
  // tomorrow's schedule preview).
  app.post('/end-of-day-brief', async () => {
    return sendEndOfDayBrief();
  });

  // Preview without sending.
  app.post('/end-of-day-brief-preview', async () => {
    const text = await buildEndOfDayBrief();
    return { text };
  });

  // Sunday 09:00 IL — weekly insights summary (sales WoW, leads conversion,
  // tips trend, no-shows, unpaid invoices).
  app.post('/weekly-insights', async () => {
    return sendWeeklyInsights();
  });
  app.post('/weekly-insights-preview', async () => {
    const text = await buildWeeklyInsights();
    return { text };
  });

  // Hourly tick — internal gate decides whether to act.
  app.post('/invoice-classifier', async () => runInvoiceClassifier());
  app.post('/content-generator', async () => runContentGenerator());
  app.post('/cash-flow-agent', async () => runCashFlowAgent());
  // Every 10 min — checks for crisis incidents.
  app.post('/crisis-agent', async () => runCrisisAgent());

  // Every 10 min — pull supplier invoices from connected Gmail inboxes.
  app.post('/email-invoice-scan', async () => scanEmailInvoices());

  // On-demand historical backfill — pull invoices from further back than the
  // default 30-day window. e.g. POST /email-invoice-backfill?days=60
  app.post('/email-invoice-backfill', async (req) => {
    const days = Math.min(365, Math.max(1, Number((req.query as any)?.days) || 30));
    return scanEmailInvoices({ backfillDays: days });
  });

  // Weekly (Sun ~09:00 IL) — WhatsApp a gaps digest: pending-review invoices,
  // suppliers overdue vs their normal rhythm, and this week's un-fetchable
  // (portal-login) invoices.
  app.post('/invoice-gaps-digest', async () => runInvoiceGapsDigest({ send: true }));
  // Preview without sending.
  app.post('/invoice-gaps-digest-preview', async () => runInvoiceGapsDigest({ send: false }));

  // Every minute — check who's scheduled for now but hasn't clocked in.
  // WhatsApps admin a one-tap link to ping the employee.
  app.post('/no-show-watcher', async () => runNoShowWatcher());

  // Weekly schedule agent — 4 endpoints, all gate on Israel time inside.
  // Cron pings them hourly; the gate decides whether to act.
  app.post('/weekly-schedule-open', async () => runWeeklyScheduleOpen());
  app.post('/weekly-schedule-reminder', async () => runWeeklyScheduleReminder());
  app.post('/weekly-schedule-final-reminder', async () => runWeeklyScheduleFinalReminder());
  app.post('/weekly-schedule-build', async () => runWeeklyScheduleBuild());

  // Every 15 min — pull externally-added events from each connected admin's
  // Google Calendar into our scheduled_event store. Best-effort per phone.
  app.post('/google-calendar-pull', async () => {
    const results = await pullAllConnectedCalendars();
    return { synced: results.length, results };
  });
};
