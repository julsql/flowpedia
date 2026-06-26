# Flowpedia

A social-style feed of Wikipedia articles — scroll, like, share and bounce from
topic to topic, with familiar Instagram/TikTok interaction patterns and a
recommendation algorithm driven by reading signals.

> Code is in English; the app UI is bilingual (en/fr), switchable in the profile.
> Visual source of truth: [`design/README.md`](./design/README.md) (Direction A).

## Stack

- **Mobile** — React Native + Expo (universal: iOS / Android / web), expo-router, FlashList.
- **API** — NestJS (Node/TypeScript), Wikipedia REST proxy + cache.
- **Shared** — `@flowpedia/shared`: DTO types + design tokens.
- **Infra** — Docker Compose (Postgres + Redis) for the next steps.

## Monorepo layout

```
apps/
  mobile/   # Expo app
  api/      # NestJS API
packages/
  shared/   # shared types + design tokens
design/     # design handoff (Direction A)
```

## Getting started

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # set a valid WIKIPEDIA_USER_AGENT
pnpm infra:up                            # optional: Postgres + Redis (later steps)

pnpm api                                 # API on http://localhost:3000/api
pnpm mobile                              # Expo (press w for web)
```

On a physical device, set `EXPO_PUBLIC_API_URL` to your machine LAN IP
(e.g. `http://192.168.1.20:3000/api`) instead of `localhost`.

## What works now (step 1)

- Card feed (handoff screen 1) fed by the live Wikipedia REST API, with caching.
- `GET /feed`, `GET /articles/:id`, `POST /events` (signal ingestion, logged for now).
- Bottom tab bar (home / explore / flow / shared / profile), language switcher.
- Optimistic like + signal logging groundwork.

## Tests

```bash
pnpm test
```

## Wikipedia / licensing

Content comes from the Wikimedia REST API. A custom `User-Agent` is required, and
article content is **CC BY-SA** — keep the source link visible in the UI.
