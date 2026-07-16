# AGENTS.md — Guide for AI Agents

This repo is a **mobile-only superapp** (Mail, To-Do, Calendar, Notes, Finance) built as an Expo app with an Express backend. Read `plan.md` (authoritative development plan) and `dev_log.md` (current phase status) before making changes.

## Repository Layout

```
superapp/
├── plan.md          # Authoritative development plan — follow it phase by phase
├── dev_log.md       # Phase completion status / audit log — keep it updated
├── mobile/          # Expo SDK 57 app (React Native 0.86, React 19.2, TS 5.9)
│   └── src/
│       ├── app/             # Expo Router v6 file-based routes
│       │   ├── (tabs)/      # mail, todo, calendar, notes, finance tabs
│       │   └── (auth)/      # login, register, onboarding
│       ├── modules/         # per-module screens/components/store/api
│       ├── components/      # shared UI library (button, card, swipeable-row, ...)
│       ├── lib/             # api client, token store, biometrics, Zod schemas
│       └── theme/           # design tokens + dark/light theme provider
└── backend/         # Node 24 + Express 5 API
    └── src/
        ├── routes/          # REST handlers per module
        ├── controllers/     # business logic
        ├── db/              # Drizzle ORM schema + drizzle-kit migrations
        ├── services/        # jwt, push, (later: mail providers, bank aggregation)
        ├── shared/          # Zod 4 schemas (hand-copied to mobile/src/lib/schemas)
        └── middleware/      # auth (jose JWT), validation, errors
```

> Note: the files at the repo root (`app/`, `components/`, `lib/`, `next.config.mjs`, `package.json`, `pnpm-lock.yaml`) are a Next.js scaffold used only for the v0 preview environment. The actual product lives entirely in `mobile/` and `backend/`. Do not build product features in the root scaffold.

## Current Status (see dev_log.md for details)

- Phase 0 (setup/architecture): complete. Full DB schema for ALL modules exists in `backend/src/db/schema.ts`. CI (`.github/workflows/ci.yml`), `mobile/eas.json`, and the backend Vercel entrypoint (`backend/api/index.ts` + `vercel.json`) are all in place.
- Phase 1 (shell + auth): complete. Tabs (all 5 screens exist), shared UI, JWT auth (jose + argon2), SecureStore, biometrics, push wiring.
- Phase 2 (Mail): complete (PR #9). Backend: `/api/mail` router + controller, IMAP sync (`services/imap.ts`), SMTP send (`services/smtp.ts`), credential encryption (`services/crypto.ts`), scheduled-send/snooze cron (`vercel.json` → `/api/mail/process-scheduled`), migration 0001 applied to Neon. Mobile: inbox tab, thread/compose/search/account-setup screens, `lib/mail-api.ts`, `hooks/use-mail.ts`, `lib/schemas/mail.schemas.ts`. Generic IMAP/SMTP only — provider OAuth (Gmail/Graph) deferred.
- Phase 3 (To-Do): complete (PRs #11–#13). Backend: `/api/tasks` router + controller (list/task CRUD, Things-style view queries, subtasks, complete/uncomplete), RRULE recurrence (`services/recurrence.ts`), migration 0002 applied to Neon, smoke test (`scripts/tasks-smoke.mjs`, 34 checks). Mobile: To-Do tab with Today/Upcoming/Anytime/Someday/Logbook views, task detail, lists management, NL quick entry (`lib/task-parser.ts`), `lib/tasks-api.ts`, `hooks/use-tasks.ts`, `lib/schemas/task.schemas.ts`. Deferred: geofenced reminders, local notifications, widgets, drag-and-drop reordering.
- Phases 4–7 (remaining modules, polish): not started. Those module tabs render `ModulePlaceholder`; auth + mail + tasks routers are mounted in `backend/src/index.ts`, the rest are stub comments.
- Modules ship **sequentially** (Mail → To-Do → Calendar → Notes → Finance), never in parallel.

## Commands

Both packages use **npm** (`package-lock.json` committed in each).

### mobile/
```bash
npm install            # deps (JS-only packages)
npx expo install <pkg> # ALWAYS use this for any package with native code
npm run start          # expo start
npm run ios / android / web
npm run lint           # expo lint
npm run typecheck      # tsc --noEmit (also run in CI)
npx expo-doctor@latest # REQUIRED after every dependency change (also run in CI)
```

### backend/
```bash
npm install
npm run dev            # tsx watch src/index.ts
npm run typecheck      # tsc --noEmit
npm run build && npm start
npm run db:generate    # drizzle-kit generate (after schema changes)
npm run db:migrate     # drizzle-kit migrate
npm run db:studio
```

Backend env: copy `backend/.env.example` → `.env` (needs `DATABASE_URL` for Neon, JWT secrets).

## Version-Safety Rules (CRITICAL — from plan.md)

1. **Expo SDK 57 is the anchor.** Never install React Native, React, or any native module manually — use `npx expo install` so versions match the SDK. Never opt out of the New Architecture.
2. Upgrade mobile deps only in waves via `npx expo install expo@latest --fix`, never piecemeal.
3. `drizzle-orm` (0.45.x) and `drizzle-kit` (0.31.x) must always be bumped **together**. Do not migrate to Drizzle 1.0 while it is in RC.
4. Zod must stay on the **same major (v4)** in both `mobile/` and `backend/` — schemas are shared by hand-copying between `backend/src/shared/` and `mobile/src/lib/schemas/`. When you change one side, update the other.
5. Exact version pins + committed lockfiles. Run `npx expo-doctor@latest` after any mobile dependency change.
6. OS floors are pinned via `expo-build-properties` (iOS 18, Android minSdk 35, targetSdk 36). Do not change them casually — policy is "previous + current major OS versions only".

## Architecture Rules

- **Offline-first sync is non-negotiable** (the #1 rewrite risk). All syncable tables use **client-generated UUID primary keys** (no `defaultRandom()` server defaults) and an `updated_at` column for conflict detection. Preserve this pattern in any new table or endpoint.
- State management split: **Zustand** for client/UI state (auth, theme, toggles), **TanStack Query 5** for server state (caching, mutations, optimistic updates). Local cache via expo-sqlite; fast persistence via react-native-mmkv.
- Lists (inbox, tasks, transactions) use **FlashList v2**, not FlatList.
- Auth: jose JWTs (access + refresh) with argon2 hashing on the backend; tokens in Expo SecureStore on mobile (`mobile/src/lib/token-store.ts`); biometric unlock via `biometric-gate.tsx`.
- New backend module endpoints: add a router in `src/routes/`, controller in `src/controllers/`, mount it in `src/index.ts` (stub comments for `/api/calendar`, `/api/notes`, `/api/finance` already mark the spots; `/api/mail` and `/api/tasks` are mounted and serve as reference implementations), validate with Zod schemas from `src/shared/`, and mirror those schemas to `mobile/src/lib/schemas/`.
- New tab screens: register the tab in `mobile/src/app/(tabs)/_layout.tsx` AND create the matching screen file — a registered tab without a screen file is a broken route.

## Design System

Apple-inspired minimal: clean whitespace, SF-style typography, subtle shadows, rounded corners, neutral palette + one accent color, 8px spacing grid, dark/light mode. Always use the theme tokens from `mobile/src/theme/` — never hardcode colors. Reuse the shared components in `mobile/src/components/` before creating new ones.

## Workflow Expectations

- Follow the phase order in `plan.md`; don't start a later phase before the current one is done.
- Update `dev_log.md` when phase status changes or notable gaps are fixed.
- Never push directly to `main` — work on a feature branch and open a PR.
- Run typecheck in both packages (and `expo-doctor` if mobile deps changed) before considering a change done.

## Known Gaps (as of last audit)

- Backend Vercel deployment is wired (`backend/api/index.ts` + `vercel.json`, incl. the mail cron) but a live deployment has not been confirmed; production env vars (`DATABASE_URL`, JWT secrets, `MAIL_CRED_SECRET`, `CRON_SECRET`) still need to be set/verified there.
- **Neon migrations are per-environment.** Migrations 0000–0002 and the live tasks smoke test (`backend/scripts/tasks-smoke.mjs`, 34/34) were verified on 2026-07-16 against the Neon DB connected to a *previous* v0 chat. Each v0 chat may connect a fresh Neon database (the current chat's DB only has `neon_auth.*` tables — no app schema). Always run `npm run db:migrate` in `backend/` before live-testing in a new environment.
- Mail is generic IMAP/SMTP only; Gmail API / Microsoft Graph OAuth and new-mail push notifications are deferred.
- To-Do deferrals: geofenced location reminders, local notifications for due tasks, home-screen widgets, drag-and-drop reordering (`sort_order` columns exist but UI ordering is static).
- Victory-native not installed (only needed in Phase 6).
