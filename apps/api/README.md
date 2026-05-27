# top-alena API

Self-hosted backend that replaces Base44 for the `top-alena` app.

## Stack

- Node 20+ / TypeScript / Fastify
- Prisma + PostgreSQL
- MinIO (S3-compatible) for file storage
- JWT auth
- Gemini for LLM / image generation
- Resend for email

## Quick start

```bash
cp .env.example .env
# fill in values (DB url, JWT_SECRET, integration keys)

npm install
npm run schema:build      # generate prisma/schema.prisma from base44/entities/*.jsonc
npm run prisma:generate
npm run prisma:migrate    # create tables
npm run dev               # http://localhost:3001
```

## Routes

| Method | Path                                | Purpose                                       |
|--------|-------------------------------------|-----------------------------------------------|
| POST   | `/api/auth/register`                | Email/password signup                         |
| POST   | `/api/auth/login`                   | Returns JWT                                   |
| GET    | `/api/auth/me`                      | Current user (auth)                           |
| ANY    | `/api/entities/:Name[/:id]`         | Generic CRUD over any Prisma model            |
| POST   | `/api/integrations/upload-file`     | Multipart upload → S3                         |
| POST   | `/api/integrations/send-email`      | Resend                                        |
| POST   | `/api/integrations/invoke-llm`      | Gemini text/multimodal                        |
| POST   | `/api/integrations/generate-image`  | Imagen                                        |
| POST   | `/api/integrations/extract-data`    | Gemini structured extraction                  |
| POST   | `/api/fn/:name`                     | Ported Base44 functions                       |
