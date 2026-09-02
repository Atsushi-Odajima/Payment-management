# syntax=docker/dockerfile:1.6

# ---------- deps ----------
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/
RUN npm ci --include=dev --no-audit --no-fund

# ---------- build ----------
FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_OUTPUT_STANDALONE=1
COPY --from=deps /app/node_modules ./node_modules
# .dockerignore keeps .env, local databases and .git out of the context.
COPY . .
# `next build` runs `prisma generate` via the postinstall/prebuild hook, but we
# call it explicitly so the client exists even when the cache is cold.
RUN npx prisma generate
RUN npx next build

# ---------- runtime ----------
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Default SQLite path inside a persistent volume (mount /data on Railway/Fly).
ENV DATABASE_URL="file:/data/prod.db"

# Standalone output: only the traced server files + static assets.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Schema + migrations for `prisma migrate deploy` at startup (no dev database).
COPY --from=build /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=build /app/prisma/migrations ./prisma/migrations
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY --from=build /app/scripts/start.sh ./scripts/start.sh

RUN mkdir -p /data && chown -R node:node /app /data
USER node

EXPOSE 3000
CMD ["sh", "scripts/start.sh"]
