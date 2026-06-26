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

## What works now

- **Infinite, always-varied feeds.** Every source is a large pool shuffled per
  session (so reloads/pull-to-refresh bring new content) and never runs out
  (random-article fallback past the pool). Tabs differ by source:
  - **For you** (default landing) — content-based "more like" your liked/saved
    interests; falls back to popular until you have signals.
  - **Popular** — global most-viewed (reshuffled each session).
  - **News** — Wikimedia current events + most-read of the day.
  - **Flow** — immersive full-screen "discover": your interests blended with
    popular, serendipitous and endless.
  - **Explore** — trending grid with continuous (infinite) scroll + search.
- **Temporary unique user** generated on first launch (persisted); attached to
  every signal (Postgres `userId`).
- **Profile** (handoff-style): avatar + name + bio, stats (Read / Liked / Saved),
  derived interest chips, a saved grid, and compact theme + language controls.
- **Theming:** light / dark / system, switchable in the profile and persisted
  (AsyncStorage); amber accent kept across both palettes.
- **Explore (handoff screen 5):** search (live Wikipedia full-text) + a
  "Trending today" 2-column grid.
- **Shared (handoff screen 6 area):** local history of the articles you've shared.
- Card feed (handoff screen 1) fed by the live Wikipedia REST API, with caching.
- **Article detail (handoff screen 3):** section chips that jump/track on scroll,
  body text with **tappable internal links** that push the target article (the
  rabbit-hole bounce), a "Keep exploring" block of related links, localized
  section labels. Parsed server-side from Wikipedia HTML (chrome stripped).
- **Immersive flow (handoff screen 2):** full-screen, vertically-paged Reels-like
  view with action column; swipe/tap to open the article.
- **Share sheet (handoff screen 4):** slide-up bottom sheet with contacts, copy
  link, etc.
- **Bookmark & like persisted** locally (AsyncStorage); saved articles listed in
  the profile. **Language choice persisted** too.
- `GET /feed`, `GET /articles/:id` (parsed sections + inline links),
  `POST /events` — signals (dwell, openFull, linkClick, like, share, save)
  **persisted to Postgres** when reachable, otherwise logged (graceful fallback).
- Web: content constrained to a centered column; bottom tab bar, language switcher.

> Postgres runs on host port **5433** (avoids clashing with a local 5432).
> `pnpm infra:up` to start it; without it the API still runs (events are logged).

## Troubleshooting

**`Unable to resolve "./metroServerLogs"` or other "Unable to resolve" errors on
start** — stale Metro cache (common after an Expo SDK upgrade or dependency
change). Clear it once:

```bash
pnpm mobile:clear   # = expo start --clear
```

After clearing once, `pnpm mobile` works normally again.

## Tests

```bash
pnpm test
```

## Wikipedia / licensing

Content comes from the Wikimedia REST API. A custom `User-Agent` is required, and
article content is **CC BY-SA** — keep the source link visible in the UI.
