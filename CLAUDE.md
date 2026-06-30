# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AutoPost: a Node.js/Express + MySQL backend, a React/Vite frontend, and a Chrome extension (**GroupFlow**) for scheduled Facebook content — both **fanpage posts** (cron-driven, server-side publish via Graph API) and **Facebook Group posts** (browser-automation, posted from the user's own logged-in session via the extension).

## Commands

### Backend (`backend/`)
```powershell
cd backend
npm install
npm run dev              # nodemon src/app.js — http://localhost:3001
npm run start            # node src/app.js (production)
npm run seed              # seed-admin.js — creates admin user + sample fanpages from .env
node scripts/test-composio-publish.js --dry-run   # test Composio token resolution, no MySQL writes
node scripts/test-composio-publish.js             # posts one real test post per fanpage via Composio
```
No lint or test-suite scripts exist in this repo — there is no `npm test`/`npm run lint`. Verify changes by reading the diff carefully and, when touching server startup or migrations, actually running `node src/app.js` against a real DB.

### Frontend (`frontend/`)
```powershell
cd frontend
npm install
npm run dev       # vite — http://localhost:5173
npm run build     # vite build → frontend/dist (gitignored — must be rebuilt after every frontend change before deploying/testing on a server that serves dist)
npm run preview
```

### Database
Copy `backend/.env.example` → `backend/.env`, fill MySQL connection vars (`DB_HOST/PORT/NAME/USER/PASS`) and `JWT_SECRET`. Create the database (`CREATE DATABASE autopost_db`), then run `backend/schema.sql` once for the base schema — every migration after that auto-applies on backend startup (see Migrations below).

## Architecture

### Migration pattern (important — read before adding any schema change)
Every migration in `backend/migrations/*.sql` has a matching `ensureXxx()` guard function in `backend/src/services/migrationRunner.js`, which checks whether the target table/column already exists (`tableExists`/`columnExists`) before applying the `.sql` file. All `ensureXxx()` calls run sequentially inside the `app.listen()` callback in `backend/src/app.js` on every backend startup — this is the **only** place migrations get applied; there is no separate `migrate` command. When adding a new migration: write the `.sql` file, add an `ensureXxx()` guard in `migrationRunner.js`, and call it from `app.js`'s startup sequence — a migration file that exists but isn't wired into `app.js` will silently never run (this has happened before in this repo).

### Fanpage posting pipeline (cron-driven, server-side)
`scheduler.js` registers 5 cron jobs on startup:
- `publishDuePosts` (every min) — claims `posts` rows where `scheduled_at <= NOW()` and status=`scheduled`, publishes via `facebookPublishService.js`
- `runDueTopicSlots` (every min) — recurring content topics → creates new posts
- `tickImageSchedule` (every min) — nightly AI-image generation windows (per-admin and per-page schedules)
- `processPendingJobs` (every 5 min) — batch image-generation jobs (`generate_jobs` table, distinct from `posts`)
- `checkPageTokens` (hourly) — Facebook token health check, refreshes Composio tokens only when already expired (no eager refresh — see `docs/TOKENS_AND_COMPOSIO.md`)

Manual publish goes through the same `publishToFacebookWithFallback()` in `facebookPublishService.js` (called from `routes/posts.js`). Each fanpage has **two possible Facebook tokens** (`fb_pages.page_token` manual, `fb_pages.composio_page_token`); `fb_pages.token_source` picks the active one, with auto-fallback to the other on publish failure if enabled in Settings.

### AI provider abstraction
Providers (text + image generation) live in the `ai_providers` table, seeded from templates in `providerTemplateService.js` (OpenAI, Claude, Gemini, Ideogram, and **9Router** — a local OpenAI-compatible gateway at `localhost:20128` that routes to Claude/GPT/Gemini, used as the configurable fallback/default). `imageService.js` and `aiService.js` dispatch by `provider_kind`. Admin/super_admin can also register fully custom providers (arbitrary `api_endpoint` + `provider_kind`) outside the template list.

### Auth & permissions
JWT bearer auth (`middleware/auth.js`) populates `req.user`. Two explicit roles: `super_admin` (unrestricted) and `admin`/regular users restricted by **page assignment** — the `user_pages` join table (migration 001) maps which fanpages a user can see/edit; `pageAccessService.js`'s `getAccessiblePageIds()` enforces this on every posts/skills/topics query. `user_providers` mirrors the same pattern for AI provider access. `middleware/rbac.js` provides role-gating helpers (`requireRole`, `canManageUsers`, etc.).

### Image storage abstraction
`mediaStorage.js` is the single entry point (`storeImageBuffer({ pageId, ... })`) — routes to Google Drive or local VPS disk based on `appSettingsService.getEffectiveMediaStorage()`. Google Drive uses **OAuth2 User Authentication** (not Service Account — see `docs/GOOGLE_DRIVE.md` for why), with per-fanpage folder override resolved by `pageDriveService.getDriveFolderIdForPage()` (page folder → global fallback folder). Images are referenced in the DB as `gdrive://FILE_ID` or `/images/...`; `resolveImageForPublish()` streams from whichever backend at publish time.

### `app_settings` table — DB-stored runtime config, not `.env`
Several integrations (Google Drive OAuth2 credentials, Composio API key/config) are deliberately stored in the `app_settings` key-value table via the Settings UI, **not** `.env` — because they're per-deployment secrets an admin configures post-deploy, not build-time config. `appSettingsService.js` caches this table in memory (`loadAppSettings()` on startup, refreshed on every write) — don't read `app_settings` via raw queries elsewhere; use the `getEffectiveXxx()` accessors.

### GroupFlow — separate system from fanpage posting
The `GroupFlow/fb-group-poster/` Chrome extension posts to **Facebook Groups** using the user's own browser session (GraphQL calls from the service worker, or DOM automation as fallback) — fundamentally different from the cron/Graph-API fanpage pipeline above, and does **not** use the `posts`/`jobs` tables. It talks to the backend via `backend/src/routes/groupPosts.js` (`/api/group-posts/*`) for draft import/pull and post-sync bookkeeping only; actual posting logic lives entirely in the extension. Full extension architecture (panel UI, posting modes, scheduling, comment automation) is documented in `docs/GROUPFLOW.md` — read it before touching anything under `GroupFlow/`.

### Frontend
React + React Router, routes declared in `frontend/src/App.jsx` under a single `ProtectedRoute`-gated `Layout`. One page component per route in `frontend/src/pages/`. `services/api.js` is a single Axios instance — base URL from `VITE_API_BASE_URL` (defaults to `localhost:3001/api`), bearer token from `localStorage`, auto-redirects to `/login` on 401 (with a carve-out for `/generate-image` 401s, which can mean "still generating" rather than "logged out").

## Project conventions (from `.cursor/rules/`)

This repo enforces **documentation-on-change**: any completed feature/fix/migration must update `CHANGELOG.md` (`[Unreleased]` bullet), `TODO.md`, and the relevant `docs/<TOPIC>.md` file in the *same session* as the code change — not as a follow-up. `docs/README.md` is the topic-doc index; check it (and the topic doc it points to) before re-deriving how an existing feature works from scratch. If a doc is missing or stale relative to the code, fix the doc as part of the change rather than leaving it stale.
