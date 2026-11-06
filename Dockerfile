# syntax=docker/dockerfile:1
# Estágios: base → deps → dev (docker compose) | build → prod (último = padrão para Render/Koyeb/Cloud Run).

FROM node:22-slim AS base
# Prisma precisa de OpenSSL em runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate

# ── Desenvolvimento: código montado por volume, hot reload com tsx ──
FROM deps AS dev
ENV NODE_ENV=development
EXPOSE 3333
CMD ["npm", "run", "dev"]

# ── Build ──
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ── Produção ──
FROM base AS prod
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node package.json ./
USER node
EXPOSE 3333
# Render/Koyeb injetam PORT; o env.ts lê daqui.
CMD ["node", "dist/server.js"]
