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
```

Always start the API first — the app reads its feed from it.

### Run on web

```bash
pnpm mobile        # then press "w", or directly:
pnpm mobile:web    # opens http://localhost:8081 in the browser
```

The web build talks to `http://localhost:3000/api` out of the box (same machine).

### Run on a USB-connected Android phone

1. On the phone: enable **Developer options → USB debugging**, plug it in, and
   accept the "Allow USB debugging" prompt.
2. Install **Expo Go** from the Play Store (no native build needed for now).
3. Make the phone reach the local API through the USB cable:

   ```bash
   adb devices                  # confirm the phone is listed/authorized
   adb reverse tcp:3000 tcp:3000   # phone's localhost:3000 -> your machine
   ```

4. Start the app and open it on the device:

   ```bash
   pnpm mobile        # then press "a"
   # or:
   pnpm mobile:android
   ```

With `adb reverse`, the default `EXPO_PUBLIC_API_URL` (`localhost:3000`) works as-is.
Over Wi-Fi instead of USB, skip `adb reverse` and set the machine LAN IP:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.20:3000/api pnpm mobile
```

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
