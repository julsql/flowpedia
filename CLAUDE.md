# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Flowpedia — a social-style (Instagram/TikTok) feed of Wikipedia articles: scroll,
like, share, and bounce topic-to-topic via tappable inline links. Code is in
English; the app UI is bilingual+ (14 locales, switchable in the profile).

## Commands

```bash
pnpm install                 # bootstrap the workspace
pnpm api                     # start NestJS API on :3000 (watch mode) — START THIS FIRST
pnpm mobile                  # Expo dev server; press w/a/i, or use the variants:
pnpm mobile:web              # web on :8081
pnpm mobile:android          # USB phone (needs `adb reverse tcp:3000 tcp:3000`)
pnpm mobile:clear            # expo start --clear — fixes stale Metro "Unable to resolve" errors
pnpm build:shared            # compile @flowpedia/shared
pnpm infra:up / infra:down   # Postgres (host :5433) + Redis via docker compose
pnpm test                    # all workspaces (only API has real tests today)
```

Run a single API test: `pnpm --filter @flowpedia/api test -- parse-article.spec.ts`
(or `-t "<test name>"`). API tests are Jest + ts-jest, colocated as `*.spec.ts`.

The mobile/shared `test` scripts are stubs (`exit 0`) — there are no RN tests yet.

The API must be running before the app: the app reads its feed from it. On a
physical device, point `EXPO_PUBLIC_API_URL` at the machine's LAN IP (the API
prints it on boot) or use `adb reverse`. Before first API run:
`cp apps/api/.env.example apps/api/.env` and set a valid `WIKIPEDIA_USER_AGENT`.

## Architecture

pnpm workspace (Node ≥20), three packages:

- `apps/api` — **NestJS**. A thin, cached proxy over the Wikimedia REST API plus
  feed assembly and signal ingestion. No build needed in dev (`nest start`).
- `apps/mobile` — **React Native + Expo** (universal iOS/Android/web),
  expo-router (file-based), FlashList. This is the whole client.
- `packages/shared` — `@flowpedia/shared`: the DTO contract (article/feed/
  interaction types) **and** design tokens, imported by both sides via
  `workspace:*`. Consumed directly from `src/` (its `main` points at TS source),
  so no rebuild step is required for the API/mobile to see type changes.

The shared types are the source of truth for the API↔app contract — change a DTO
here, both ends follow.

### API modules (`apps/api/src/<feature>/`)

Standard Nest feature modules wired in `app.module.ts`:

- **wikipedia** — `WikipediaService` is the core: fetches summaries, popular/news/
  related title pools, full articles, and search from `xx.wikipedia.org`'s REST
  API, caching responses via `CacheService` (Redis when `REDIS_URL` is set,
  in-memory fallback otherwise; TTL per kind).
  `parse-article.ts` strips Wikipedia HTML chrome into structured
  sections/infobox/links (the unit-tested part). Injected into most controllers.
- **feed** — `FeedService.getFeed(tab, lang, cursor, seeds, seed, exclude)`.
  Builds a per-tab ordered candidate pool of titles, then hydrates a page of 5.
  Key ideas (see comments in `feed.service.ts`): a **deterministic seeded
  shuffle** (`mulberry32`) makes each session's order different but pagination
  stable; `blendDiverse` injects "different subject" titles every Nth slot so the
  user always has an escape from a rabbit hole; past the pool it falls back to
  random articles so the feed is **infinite**. Tabs: `forYou` (related-to-seeds +
  popular), `popular`, `news` (current events + interests), `discover` (backs the
  immersive Flow screen).
- **articles** — `GET /articles/:id` → parsed sections with inline internal links.
- **search** — paginated full-text search for Explore.
- **events** — `POST /events` ingests user signals (dwell, scrollDepth, linkClick,
  like, share, save, openFull) into Postgres **when `DATABASE_URL` is reachable,
  else logs them** (graceful degradation — the API runs with no infra). These are
  the raw material for the future recommendation algorithm. `synchronize: true`
  on the TypeORM datasource (MVP; migrations later).
- **images** — `GET /image?u=` proxy. Devices often can't load Wikimedia images
  directly (UA policy 403s); the API refetches with a compliant UA and streams
  back. Host-allowlisted to wikimedia/wikipedia (anti-SSRF).

Global API prefix is `/api`; CORS is open; binds `0.0.0.0` for LAN access.

### Mobile structure

- `app/` — expo-router routes: `(tabs)/` = home(index)/explore/flow/shared/profile;
  `article/[id]` = detail. `_layout.tsx` nests the provider stack.
- `src/` — providers (React context, all AsyncStorage-backed):
  - **LibraryProvider** — liked/saved/shared/read articles + muted interests.
    Liked ids are the recommendation **seeds** sent to the feed.
  - **SeenProvider** — recently-shown article ids (3-day TTL, max 400), sent as
    `exclude` so the feed doesn't re-serve them.
  - **UserProvider** — temporary anonymous user id, persisted, attached to every
    signal.
  - **ThemeProvider** (light/dark/system, amber accent), **ShareSheetProvider**.
  - `api/client.ts` — the single API surface (`fetchFeed`/`fetchArticle`/
    `fetchSearch`/`sendEvents` + `proxiedImageUrl`/`largeImageUrl` helpers).
    `BASE_URL` from `EXPO_PUBLIC_API_URL`, defaults to `localhost:3000/api`.
  - `i18n/` — i18next; `SUPPORTED_LOCALES` **must stay in sync** with the API's
    `SUPPORTED_LANGS` in `wikipedia.service.ts` (the active locale also selects
    the Wikipedia content language).

### Data flow

App requests `/feed?tab=&lang=&seeds=&seed=&exclude=` → FeedService builds a
seeded, diversity-blended title pool → hydrates 5 summaries from WikipediaService
(cached) → app renders cards. Tapping an inline link pushes `article/[id]` (the
"bounce"). Every interaction fires a fire-and-forget `POST /events`. Likes update
the seeds; shown ids accumulate in `exclude`.

## Conventions

- Conventional Commits, messages in English (`feat:`, `fix:`, `chore:`…).
- Prettier, 100-char width.
- Wikipedia content is **CC BY-SA** — keep the source link visible in the UI; a
  valid `User-Agent` is mandatory for all Wikimedia calls.
- Visual source of truth: `design/README.md` (Direction A). README "What works
  now" maps features to handoff screen numbers.
