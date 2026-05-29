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
# Apply additive schema changes to Supabase on start (idempotent; non-fatal so
# a transient DB hiccup never blocks boot), then run the server.
CMD ["sh", "-c", "npx prisma db push --skip-generate || echo 'prisma db push skipped/failed, continuing'; node dist/index.js"]
