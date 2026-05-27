import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { uploadStreamToS3, createSignedUrl } from '../lib/storage.js';
import { sendEmail } from '../lib/email.js';
import { invokeLLM, generateImage, extractDataFromFile } from '../lib/llm.js';

export const integrationsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // POST /api/integrations/upload-file  (multipart)
  app.post('/upload-file', async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'no_file' });
    const { url } = await uploadStreamToS3(file.filename, file.mimetype, file.file);
    return { file_url: url };
  });

  // POST /api/integrations/send-email  { to, subject, body, html?, from? }
  app.post('/send-email', async (req) => {
    const { to, subject, body, html, from } = req.body as any;
    const result = await sendEmail({ to, subject, text: body, html, from });
    return result;
  });

  // POST /api/integrations/invoke-llm  { prompt, response_json_schema?, file_urls?, model? }
  app.post('/invoke-llm', async (req) => {
    const { prompt, response_json_schema, file_urls, model } = req.body as any;
    return invokeLLM({ prompt, responseSchema: response_json_schema, fileUrls: file_urls, model });
  });

  // POST /api/integrations/generate-image  { prompt }
  app.post('/generate-image', async (req) => {
    const { prompt } = req.body as any;
    return generateImage({ prompt });
  });

  // POST /api/integrations/extract-data  { file_url, json_schema }
  app.post('/extract-data', async (req) => {
    const { file_url, json_schema } = req.body as any;
    return extractDataFromFile({ fileUrl: file_url, schema: json_schema });
  });

  // POST /api/integrations/signed-url  { file_url, expires_in }
  app.post('/signed-url', async (req) => {
    const { file_url, expires_in } = req.body as any;
    return createSignedUrl(file_url, expires_in);
  });
};
