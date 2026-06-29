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

### Run over Wi-Fi (no cable)

The API binds to `0.0.0.0`, so it's reachable from any device on the same
network. On start it prints the LAN URL to use, e.g.:

```
Flowpedia API → http://localhost:3000/api
            LAN → http://192.168.1.20:3000/api  (set EXPO_PUBLIC_API_URL to this on your phone)
```

Point the app at that address (skip `adb reverse`):

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.20:3000/api pnpm mobile
```

Then scan the QR with Expo Go (phone + Mac on the same Wi-Fi). If the phone
can't reach the API, allow incoming connections for Node in
**System Settings → Network → Firewall** (or turn the firewall off briefly to
confirm), and make sure the network isn't "client isolation"/guest mode.

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
  every signal (Postgres `userId`). Guest mode stays fully usable without an account.
- **Accounts & auth:** email sign-up + login (JWT), password reset by email
  (Gmail SMTP, console fallback in dev), change username/password, **public or
  private** account, delete account **or** wipe all data (RGPD). A signed-in
  account's library (liked/saved/shared) and signals move **server-side, per
  account** (synced on login); guests stay local.
- **Social:** follow / unfollow (with **approval for private accounts**),
  followers & following lists, find people, remove a follower, accept/reject
  follow requests.
- **Stories:** reshare an article to your followers for **24h** — bubbles at the
  top of Home (Instagram-style), grouped by author.
- **Send pages:** send an article straight to another account's **inbox**, with an
  optional note (from the share sheet → "Send to an account").
- **Notifications:** in-app center + **unread badge** (bell on Home), with native
  **push** (Expo) for follow requests, accepted requests, new followers and
  received pages. In-app text is localized; push is best-effort (needs an EAS
  `projectId` for real device tokens).
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

## Deployment

Production runs three containers from `docker-compose.prod.yml` — Postgres, the
API, and the Expo web bundle served by nginx — behind the host nginx:

| Service | Domain | Container | Loopback port |
| --- | --- | --- | --- |
| Web | `flowpedia.julsql.fr` | `flowpedia-web` | `127.0.0.1:8110` |
| API | `flowpedia-api.julsql.fr` | `flowpedia-api` | `127.0.0.1:8111` |

The web bundle calls the API over HTTPS, and the future mobile app points at the
same `flowpedia-api.julsql.fr`. `EXPO_PUBLIC_API_URL` is baked into the web bundle
at **build time** (a compose `build.args`), so it can't be changed at runtime.

### CI/CD

Push to `main` triggers `.github/workflows/deploy.yml` (or run it manually). It
SSHes into the server, writes `.env` from the `ENV_FILE` secret, then
`docker compose -f docker-compose.prod.yml up --build -d`.

GitHub repo secrets required: `SSH_HOST`, `SSH_USER`, `SSH_KEY`, `DEPLOY_PATH`
(the repo path on the server), and `ENV_FILE` (the full `.env`, see
`.env.example`).

### First-time server setup

```bash
# 1. Clone into DEPLOY_PATH, create the prod env
git clone <repo> /path/to/flowpedia && cd /path/to/flowpedia
cp .env.example .env   # set POSTGRES_PASSWORD + a valid WIKIPEDIA_USER_AGENT

# 2. Bring the stack up (or just push to main)
docker compose -f docker-compose.prod.yml up --build -d

# 3. Host nginx vhosts + TLS
sudo cp infra/nginx/flowpedia.julsql.fr.conf      /etc/nginx/conf.d/
sudo cp infra/nginx/flowpedia-api.julsql.fr.conf  /etc/nginx/conf.d/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d flowpedia.julsql.fr -d flowpedia-api.julsql.fr
```

DNS: point both `flowpedia.julsql.fr` and `flowpedia-api.julsql.fr` (A/AAAA) at
the server. CORS is open on the API, so the cross-origin web → API calls work.
User signals are persisted to Postgres; if the DB is down the API still serves
(events are logged only).

## Wikipedia / licensing

Content comes from the Wikimedia REST API. A custom `User-Agent` is required, and
article content is **CC BY-SA** — keep the source link visible in the UI.
