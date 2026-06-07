import type { FastifyPluginAsync } from 'fastify';
import { sendRestroomReminder, sendAbandonedReminder, sendT24SurveyReminders, runAutoTrackerAnalysis, runSalesAutoClose, runWeeklyPersonalGoals } from '../functions/load.js';

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
};
