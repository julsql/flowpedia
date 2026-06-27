# --- Build (pnpm workspace: only @flowpedia/api and its deps) ---
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo

# Manifests first so the install layer is cached across source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --filter @flowpedia/api...

# Sources, then compile (nest build → apps/api/dist).
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm --filter @flowpedia/api build

# Drop dev dependencies for the runtime image.
RUN pnpm --filter @flowpedia/api... install --frozen-lockfile --prod

# --- Runtime ---
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared ./packages/shared
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/
EXPOSE 3000
# main.ts binds 0.0.0.0:$PORT (default 3000), global prefix /api.
CMD ["node", "apps/api/dist/main.js"]
