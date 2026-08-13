FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY backend ./backend
COPY frontend ./frontend
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV CLIENT_DIST_DIR=/app/frontend/dist
ENV MIGRATIONS_DIR=/app/backend/migrations
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN pnpm install --prod --frozen-lockfile
COPY --from=builder /app/backend/dist ./backend/dist
COPY backend/migrations ./backend/migrations
COPY --from=builder /app/frontend/dist ./frontend/dist
USER node
EXPOSE 3000
CMD ["sh", "-c", "node backend/dist/storage/migrate.js && exec node backend/dist/server/main.js"]
