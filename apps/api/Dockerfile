FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

FROM base AS deps
COPY package.json ./
RUN npm install --no-audit --no-fund

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# schema.prisma is committed; just generate the client and compile.
RUN npm run prisma:generate && npm run build

FROM base AS runtime
ENV NODE_ENV=production
# Copy node_modules from build so the generated Prisma client is included.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
EXPOSE 3001
# Just run the server. Schema changes on prod are applied via explicit additive
# SQL (never `prisma db push`, which drifts against the live schema and here only
# ever "failed, continuing" anyway). Dropping it also lets the app boot over the
# Supabase transaction pooler (port 6543), where `db push` would HANG forever on
# an advisory lock it can't hold through pgbouncer.
CMD ["node", "dist/index.js"]
