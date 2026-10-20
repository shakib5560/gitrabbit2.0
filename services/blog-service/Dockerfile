# ==============================================================================
# Production Multi-Stage Dockerfile for Blog Service (Fastify + Prisma)
# ==============================================================================

# Stage 1: Dependencies & Prisma Generation
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate

# Stage 2: TypeScript Build
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: Minimal Production Runtime
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0

RUN apk add --no-cache dumb-init openssl libc6-compat

# Security: Non-root unprivileged service account
RUN addgroup --system --gid 1001 fastify && \
    adduser --system --uid 1001 fastify

COPY --from=builder --chown=fastify:fastify /app/package.json ./package.json
COPY --from=builder --chown=fastify:fastify /app/node_modules ./node_modules
COPY --from=builder --chown=fastify:fastify /app/prisma ./prisma
COPY --from=builder --chown=fastify:fastify /app/dist ./dist
COPY --chown=fastify:fastify entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh || true

USER fastify

EXPOSE 4000

HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4000/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["/bin/sh", "./entrypoint.sh"]
