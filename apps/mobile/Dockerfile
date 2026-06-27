# --- Build the Expo web bundle (static SPA, app.json web.output = "single") ---
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo

# The API URL is baked into the JS bundle at build time (EXPO_PUBLIC_*).
ARG EXPO_PUBLIC_API_URL=https://flowpedia-api.julsql.fr
ENV EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL}

# Manifests first so the install layer is cached across source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY apps/mobile/package.json ./apps/mobile/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --filter @flowpedia/mobile...

COPY packages/shared ./packages/shared
COPY apps/mobile ./apps/mobile
RUN pnpm --filter @flowpedia/mobile build:web

# --- Serve the static bundle with nginx ---
FROM nginx:1.27-alpine
COPY apps/mobile/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/mobile/dist /usr/share/nginx/html
EXPOSE 80
