FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Placeholder so better-auth doesn't throw during static page generation.
# The real secret is injected at runtime via environment variable.
ARG BETTER_AUTH_SECRET=build-time-placeholder
ENV BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET
ARG BETTER_AUTH_URL=http://localhost:4000
ENV BETTER_AUTH_URL=$BETTER_AUTH_URL
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Migration script — runs before the server on every startup (idempotent)
COPY --from=builder /app/migrate-auth.mjs ./migrate-auth.mjs

EXPOSE 4000
ENV PORT=4000
ENV HOSTNAME="0.0.0.0"

# Run migration first, then start Next.js
CMD ["sh", "-c", "node migrate-auth.mjs && node server.js"]
