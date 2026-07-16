# Development Log — Superapp

**Date:** 2026-07-16 (Phase 5 — Notes module fully merged to main via PR #21; log updated from a fresh chat environment)
**Branch:** v0/mobab41225-5541-f5a44dd2 (base: main @ 21d34eb)
**Reference:** plan.md (Final — Mobile-Only, Version-Pinned Stack)

> **Environment note:** each v0 chat may connect a **different Neon database**, so always run `npm run db:migrate` in `backend/` before any live testing in a new environment. There are now **five migrations (0000–0004)** — 0004 (`0004_large_wrecker.sql`) adds the Phase 5 notes columns (`notes.content_text`, `notes.is_pinned`) and the `note_versions` table. Migrations have **not** been applied in *this* chat's environment yet (fresh clone, no installs run); earlier verification runs listed below were performed in previous chat environments.

---

## Phase Status Summary

| Phase | Name | Status |
|---|---|---|
| Phase 0 | Project Setup & Architecture | ✅ Complete |
| Phase 1 | Superapp Shell & Navigation | ✅ Complete (pending live Vercel deploy verification) |
| Phase 2 | Mail Module | ✅ Complete (IMAP/SMTP; provider OAuth deferred) |
| Phase 3 | To-Do Module | ✅ Complete (widgets/geofencing/local notifications deferred) |
| Phase 4 | Calendar Module | ✅ Complete (device sync one-way; event write-back + reminders push deferred) |
| Phase 5 | Notes Module | ✅ Complete (block editor v1; 10tap/TipTap rich editor, images/drawing, offline SQLite cache deferred) |
| Phase 6 | Finance Module | ❌ Not started (placeholder only) |
| Phase 7 | Polish & Launch | ❌ Not started |

---

## Phase 0 — Project Setup & Architecture ✅

**Done:**
- Repo structure matches plan: `mobile/` (Expo) + `backend/` (Express) in a single repo, no monorepo.
- Mobile stack pinned and matching plan: Expo SDK 57 (`~57.0.6`), React Native 0.86.0, React 19.2.3, Expo Router v6, Zustand 5, TanStack Query 5, react-native-mmkv 4, expo-sqlite, FlashList v2, expo-image / secure-store / notifications / local-authentication / calendar (all SDK 57 versions), Reanimated 4.5, Gesture Handler 2.32, Zod 4.
- Backend stack pinned and matching plan: Node 24 (`engines.node >= 24`), Express 5.2.1, Drizzle ORM 0.45.1 + drizzle-kit 0.31.8 (bumped together per version-safety rules), @neondatabase/serverless 1.1.0, Zod 4.4.3 (same major as mobile), jose 6, argon2, Nodemailer 7.
- Full database schema implemented in `backend/src/db/schema.ts` covering ALL modules (users, refresh_tokens, accounts, mail_threads, emails, task_lists, tasks, calendars, events, notebooks, notes, finance_accounts, transactions, budgets, push_tokens). Initial migration generated (`0000_glossy_ronan.sql`).
- Offline-first sync design honored: client-generated UUID PKs (no `defaultRandom()` on syncable tables) + `updated_at` on all syncable tables for conflict detection.
- `expo-build-properties` installed with iOS/Android targets pinned (commit 8e6f48b).
- Lockfiles committed for both packages; `.env.example` + `drizzle.config.ts` in place.
- Design system foundation: `mobile/src/theme/` with tokens and dark/light theme provider.

**Closed since last audit (PR #5, commit 9d625a6):**
- ✅ CI added: `.github/workflows/ci.yml` runs on push to main + PRs — mobile job (Node 24, `npm ci`, `npm run typecheck`, `npx expo-doctor@latest`) and backend job (`npm ci`, `npm run typecheck`). A `typecheck` script was added to `mobile/package.json`.
- ✅ `mobile/eas.json` added: EAS CLI >= 16, remote appVersionSource, development / preview / production build profiles with channels (EAS Update ready). `runtimeVersion: { policy: "appVersion" }` added to `app.json`.
- ✅ Backend Vercel entrypoint added: `backend/api/index.ts` exports the Express app, `backend/vercel.json` rewrites all routes to it, and `src/index.ts` only calls `app.listen` when `process.env.VERCEL` is unset.

**Remaining gaps:**
- Backend deployment to Vercel is wired up but a live deployment has not been confirmed.
- Victory-native not installed yet (acceptable — only needed in Phase 6).

## Phase 1 — Superapp Shell & Navigation ✅

**Done:**
- Expo Router v6 `(tabs)` layout with 5 tabs (Mail, To-Do, Calendar, Notes, Finance), Apple-style theming via theme tokens.
- Shared UI component library: `button`, `card`, `text-field`, `empty-state`, `swipeable-row` (Gesture Handler based), `screen-header`, `module-placeholder`, `ui/modal` (added in PR #5).
- Theme provider with dark/light mode (`src/theme/index.tsx` + `tokens.ts`).
- Auth — backend: full Express 5 auth stack — `auth.routes.ts`, `auth.controller.ts`, jose JWT service (access/refresh), argon2 hashing, refresh token table, validation + error middleware, Zod schemas in `src/shared/`.
- Auth — mobile: `(auth)` route group with login, register, onboarding screens; Zustand auth store; SecureStore token storage (`token-store.ts` + web fallback); biometric unlock (`biometric-gate.tsx`, `biometrics.ts` via expo-local-authentication); API client (`lib/api.ts`); auth schemas mirrored in `lib/schemas/`.
- Push notifications wired early: `lib/notifications.ts` (mobile) + `services/push.ts` and `push_tokens` table (backend).
- Settings screen scaffolded.

**Closed since last audit (PR #5 + follow-up):**
- ✅ Broken `mail` route fixed: `mobile/src/app/(tabs)/mail.tsx` now exists as a `ModulePlaceholder` ("Phase 2"), matching the other module tabs. All 5 registered tabs now resolve.
- ✅ CI/CD portion of Phase 1 done (CI workflow, `eas.json`, Vercel serverless entrypoint — see Phase 0 section).
- ✅ Bug fixes: MMKV Zustand adapter now uses `storage.remove()` instead of the nonexistent `.delete()` (react-native-mmkv 4 API, commits 9d625a6 + c95ce84); `ThemeColors` type in `theme/tokens.ts` widened to a mapped `string` type so dark palette values typecheck.

**Remaining gaps:**
- Live Vercel deployment of the backend not yet confirmed (entrypoint + `vercel.json` are in place).

## Phase 2 — Mail Module ✅ (PR #9, merged @ 4c01b58)

**Done — backend:**
- Schema migration `0001_low_kate_bishop.sql` generated and applied: mail account credentials (IMAP/SMTP config on `accounts`), `mail_threads` (`folder`, `snoozed_until`), `emails` (`imap_uid`, `message_id`, `folder`, `scheduled_at`), sync-state columns.
- `services/crypto.ts` — AES-256-GCM encryption for stored IMAP/SMTP passwords (`MAIL_CRED_SECRET`).
- `services/imap.ts` — IMAP sync (imapflow + mailparser): incremental UID-based fetch per folder, thread grouping, flag/read-state sync.
- `services/smtp.ts` — Nodemailer send with per-account SMTP config, scheduled-send support.
- `controllers/mail.controller.ts` + `routes/mail.routes.ts` mounted at `/api/mail`: accounts CRUD + sync, threads (list/detail/unread-count/snooze/unsnooze), send, search, attachment download, `process-scheduled`.
- Cron wiring: `backend/vercel.json` cron hits `/api/mail/process-scheduled` (cron-or-user auth) for scheduled sends and snooze wake-ups.

**Done — mobile:**
- `lib/mail-api.ts` API layer + `lib/schemas/mail.schemas.ts` (mirrored from `backend/src/shared/`) + `hooks/use-mail.ts` TanStack Query hooks.
- Screens: inbox (`(tabs)/mail.tsx`, FlashList v2, replaces placeholder), thread detail (`mail/thread/[id].tsx`), compose (`mail/compose.tsx`), search (`mail/search.tsx`), account setup (`mail/account-setup.tsx` for IMAP/SMTP credentials).

**Verification (2026-07-16, this branch):**
- ✅ `npm run typecheck` passes in both `backend/` and `mobile/`.
- ✅ `npx expo-doctor@latest` passes in `mobile/`.
- ✅ Migrations 0000 + 0001 applied to the connected Neon database (`drizzle-kit migrate`); all 15 tables incl. mail columns confirmed via information_schema.
- ✅ Live smoke test against Neon: server boots, `/health` 200; mail routes reject unauthenticated requests (401); after register → JWT, `/api/mail/accounts`, `/threads`, `/threads/unread-count`, `/search` all return 200 with valid payloads. Test user removed afterward.

**Deferred (not in Phase 2 scope as shipped):**
- Provider OAuth integrations (Gmail API / Microsoft Graph) — generic IMAP/SMTP only for now.
- Push notification triggers on new mail.

## Phase 3 — To-Do Module ✅ (PRs #11, #12, #13, merged @ 7adc5d9)

**Done — backend:**
- Schema migration `0002_brainy_mandrill.sql` generated and applied: `tasks.is_someday` (Someday view), `tasks.tags_json`, plus indexes on `parent_task_id`, `due_date`, `scheduled_date`, `completed_at`.
- `shared/task.schemas.ts` — Zod 4 schemas for list/task create + patch (mirrored to `mobile/src/lib/schemas/task.schemas.ts`).
- `services/recurrence.ts` — dependency-free RRULE subset parser/advancer (FREQ=DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, BYDAY, BYMONTHDAY) for recurring tasks.
- `controllers/tasks.controller.ts` + `routes/tasks.routes.ts` mounted at `/api/tasks` in `src/index.ts` (replacing the Phase 3 stub comment): task-list CRUD, task CRUD, Things-style view queries (`?view=today|upcoming|anytime|someday|logbook`), `?listId=` filtering, `/counts` badge endpoint, subtasks (one level deep, nested rejected), `/:id/complete` (auto-completes subtasks; recurring tasks spawn the next occurrence via RRULE) and `/:id/uncomplete`. All queries scoped to the authenticated user; deleting a list nulls `list_id` instead of deleting tasks.
- `scripts/tasks-smoke.mjs` — 34-check API smoke test covering auth guard, validation, all five views, recurrence roll-forward, subtask cascade, list deletion semantics, and cross-user isolation.

**Done — mobile:**
- `lib/tasks-api.ts` API layer + `lib/schemas/task.schemas.ts` (mirrored from `backend/src/shared/`) + `hooks/use-tasks.ts` TanStack Query hooks with optimistic complete/uncomplete.
- `lib/task-parser.ts` — natural-language quick entry ("tomorrow 9am buy milk", "every monday", "!!", "#tag").
- Screens: To-Do tab (`(tabs)/todo.tsx`, replaces placeholder) with Things 3-style Today / Upcoming / Anytime / Someday / Logbook views on FlashList v2 + swipe-to-complete/delete; task detail (`todo/task/[id].tsx`) with notes, dates, priority, recurrence, tags, and subtask checklist; lists management (`todo/lists.tsx`) and per-list view (`todo/list/[id].tsx`).
- Components: `todo/task-row.tsx`, `todo/quick-entry-sheet.tsx` (NL quick entry with live parse preview).

**Verification (2026-07-16, this branch):**
- ✅ `npm run typecheck` passes in both `backend/` and `mobile/`.
- ✅ `npx expo-doctor@latest` passes in `mobile/` (20/20 checks).
- ✅ Migrations 0000 + 0001 + 0002 applied to the connected Neon database via `drizzle-kit migrate` (note: this chat's Neon DB was fresh, so all three were applied here); all 15 tables confirmed via information_schema, including the new `tasks.is_someday` / `tasks.tags_json` columns.
- ✅ Live smoke test against Neon: server boots, `/health` 200, `node scripts/tasks-smoke.mjs` — all 34 checks pass (auth guard, list CRUD, all five views, counts, subtask rules, recurring-task roll-forward, logbook, uncomplete, list-deletion semantics, cross-user 404). Test users removed afterward.

**Deferred (not in Phase 3 scope as shipped):**
- Geofenced location reminders, local notifications for due tasks, home-screen widgets, drag-and-drop list reordering (sort_order fields exist; UI ordering is static for now).

## Phase 4 — Calendar Module ✅ (PRs #16, #17, merged @ 77cd81e)

**Done — backend:**
- Schema migration `0003_dapper_lizard.sql` generated and applied: `events.description`, `events.timezone`, index on `events.end_time`.
- `shared/calendar.schemas.ts` — Zod 4 schemas for calendar/event create + patch, events-range query, `.ics` import (mirrored to `mobile/src/lib/schemas/calendar.schemas.ts`).
- `services/recurrence.ts` extended with `occurrencesBetween()` — expands an event's RRULE into concrete occurrences inside a query window (expanded instances are flagged `isRecurringInstance`).
- `services/ics.ts` — dependency-free iCalendar (RFC 5545) `buildIcs()` / `parseIcs()` for export and import, incl. line folding/unfolding, all-day `VALUE=DATE` handling, and UID round-tripping.
- `controllers/calendar.controller.ts` + `routes/calendar.routes.ts` mounted at `/api/calendar` in `src/index.ts` (replacing the Phase 4 stub comment): calendar CRUD (+ per-calendar event counts, `GET /calendars/:id/export.ics`), event CRUD, range query `GET /events?start&end` with `calendarId` filter, recurring-event expansion, and `includeTasks=true` **task overlay** (first superapp integration — dated tasks appear inside calendar views), `GET /search?q=`, `POST /import` (.ics; dedupes on ICS UID via `events.external_id`). All queries scoped to the authenticated user; deleting a calendar cascades its events.
- `scripts/calendar-smoke.mjs` — 31-check API smoke test covering auth guard, validation, calendar/event CRUD, recurrence expansion, task overlay, search, .ics export/import + UID dedupe, cross-user isolation, and cascade-delete semantics.

**Done — mobile:**
- `lib/calendar-api.ts` API layer + `lib/schemas/calendar.schemas.ts` (mirrored from `backend/src/shared/`) + `hooks/use-calendar.ts` TanStack Query hooks (calendars/events/search/import with cache invalidation).
- `lib/event-parser.ts` — Fantastical-style natural-language event entry ("Lunch with Anna tomorrow 12pm at Cafe Kor", ranges "3pm-4pm", "for 90 min", "all day", "every monday", "remind 30 min before"). Pure + dependency-free.
- `lib/device-calendar.ts` — device-first sync via expo-calendar (iOS EventKit / Android Calendar Provider): reads device calendars (iCloud, Google, …) and imports their events through the backend `.ics` import endpoint; UID dedupe makes re-syncs incremental. One-way (device → app) for now.
- Screens: Calendar tab (`(tabs)/calendar.tsx`, replaces placeholder) with **Month / Week / Agenda** views + to-do overlay rows; event detail (`calendar/event/[id].tsx`) with title/notes/location, calendar picker, times, all-day switch, reminder, recurrence; calendars management (`calendar/calendars.tsx`) with create/rename/recolor/delete, device-calendar sync, and `.ics` file import (expo-document-picker); search (`calendar/search.tsx`).
- Components: `calendar/event-row.tsx` (+ `TaskOverlayRow`), `calendar/quick-entry-sheet.tsx` (NL quick entry with live parse preview).
- `app.json`: `expo-calendar` config plugin added with the calendar permission string (required for device sync).

**Verification (2026-07-16, this branch):**
- ✅ `npm run typecheck` passes in both `backend/` and `mobile/`.
- ✅ `npx expo-doctor@latest` passes in `mobile/` (20/20 checks), including after adding the `expo-calendar` plugin.
- ✅ Migrations 0000–0003 applied to the connected Neon database via `drizzle-kit migrate` (this chat's Neon DB was fresh, so all four were applied here).
- ✅ Live smoke test against Neon: server boots, `/health` 200, `node scripts/calendar-smoke.mjs` — all 31 checks pass (auth guard, calendar/event CRUD + validation, recurring expansion with `isRecurringInstance`, task overlay, calendarId filter, search, .ics export, import + UID-dedupe re-import, cross-user 404s, cascade delete). Test users removed afterward.

**Deferred (not in Phase 4 scope as shipped):**
- Two-way device sync (writing app events back to the device calendar) — sync is one-way device → app.
- Push/local notifications for event reminders (`reminder_minutes` is stored and editable but nothing fires yet).
- Provider OAuth calendar sync (Google/Microsoft) — device-calendar + .ics import only.
- Day view (Month/Week/Agenda shipped; plan mentions day view as optional polish).

## Phase 5 — Notes Module ✅ (PRs #19, #20, #21 — fully merged to main @ 21d34eb)

**Backend (PRs #19, #20):**
- Schema migration `0004_large_wrecker.sql`: `notes.content_text` (search snippet source), `notes.is_pinned`, `notes.updated_at` index, and new `note_versions` table (cascade FK to notes, unique `(note_id, version)` index) for version history.
- Shared Zod schemas in `backend/src/shared/note.schemas.ts` (mirrored by hand to `mobile/src/lib/schemas/note.schemas.ts` per plan §0.1): block-based note doc (`{ type: "doc", content: Block[] }` — paragraph/heading/bullet/checklist blocks), notebook + note request/response schemas.
- Notes controller + routes mounted at `/api/notes`: notebook CRUD, note CRUD with snippet extraction, full-text search (`/search?q=`), tag listing (`/tags`), version history (`/:id/versions`, snapshot-on-save, restore endpoint), optimistic concurrency via `baseVersion` → 409 with current note on conflict (last-write-wins with conflict detection per plan).
- `scripts/notes-smoke.mjs` passes live against the connected Neon DB (auth guard, notebook/note CRUD + validation, search, tags, pin, versions + restore, conflict 409, cross-user 404s, SET NULL on notebook delete).

**Mobile (PR #21, merged @ 21d34eb):**
- API layer `lib/notes-api.ts` + TanStack Query 5 hooks `hooks/use-notes.ts` (notebooks, notes, search, tags, versions/restore) with cache invalidation keyed by `noteKeys`.
- Notes tab (`(tabs)/notes.tsx`): Apple Notes-style list with pinned section, notebook filter chips with counts, swipe to delete / pin-unpin, FAB creates a note and opens the editor.
- Note editor (`notes/note/[id].tsx`): title + `BlockEditor` (paragraph/heading/bullet/checklist blocks with block-type toolbar, split-on-newline, backspace-merge), debounced autosave (900 ms, flush on unmount) with `baseVersion` conflict handling (409 → re-fetch + re-seed), notebook picker sheet, tag chips (add/remove), pin toggle, delete, and version-history sheet with restore.
- Notebooks screen (`notes/notebooks.tsx`): create/rename/delete notebooks (delete moves notes back to All Notes).
- Search screen (`notes/search.tsx`): debounced full-text search plus tag-chip browsing when no query is active.
- Screens registered in the root stack with headers; `npx tsc --noEmit` clean and `npx expo-doctor` 20/20 checks passed at merge time (verified in the previous chat environment before PR #21 was merged).

**Deferred (not in Phase 5 scope as shipped):**
- 10tap/TipTap rich-text editor with inline marks (bold/italic), images/attachments, and drawing — v1 uses the block editor; schema already stores ProseMirror-style JSON so migration is additive.
- Offline expo-sqlite cache + background sync (schema is ready: client-generated UUIDs + `updated_at`).
- Cross-module links (checklist block → Tasks module): `taskId` is in the block schema but no UI creates the link yet.

## Phase 6 — Finance Module ❌

- Finance tab renders `ModulePlaceholder` ("coming soon"); `/api/finance` is a stub comment in `src/index.ts`.
- Database schema exists (Phase 0), but no controllers, services, or provider integrations (GoCardless/Tink) yet.

## Phase 7 — Polish & Launch ❌

- No universal search, cross-module linking, Today dashboard, widgets, tests, or release tooling yet.

---

## Recommended Next Steps

1. Deploy the backend to Vercel and verify `/health` + auth/mail/tasks/calendar/notes routes respond in production; set `DATABASE_URL`, JWT secrets, `MAIL_CRED_SECRET`, and `CRON_SECRET` as Vercel env vars, and run `npm run db:migrate` against the production database.
2. Verify the `/api/mail/process-scheduled` cron fires on the live deployment.
3. Begin Phase 6 (Finance module) per plan — PFM-only v1: finance routes/controller on the backend (mount at the `/api/finance` stub), account dashboard, transaction feed with rule-based categorization, budgets, and victory-native charts replacing the Finance placeholder. Bank aggregation via GoCardless Bank Account Data or Tink.
4. Optionally close Phase 3/4/5 deferrals alongside Phase 6: local notifications for due tasks and event reminders (`lib/notifications.ts` is already wired), two-way device-calendar sync, drag-and-drop reordering using the existing `sort_order` fields, 10tap/TipTap editor evaluation, and checklist-block → Tasks linking (`taskId` already in the note block schema).

---

## Git History Reference

```
21d34eb Merge PR #21 — execute-remaining-tasks (Phase 5: notes mobile screens, editor, notebooks, search) (current main)
22a75a8 Merge PR #20 — notes-feature-development (Phase 5: notes smoke test)
6666d5f Merge PR #19 — plan-execution (Phase 5: notes controller/routes, shared schemas, migration)
41fd92f Merge PR #18 — calendar-feature-development (Phase 4 wrap-up: Neon migrations, CalendarScreen overhaul)
77cd81e Merge PR #17 — calendar-backend-and-mobile (Phase 4: calendar mobile UI, views + screens)
6b0180d Merge PR #16 — calendar-and-events-task (Phase 4: calendar routes/controller/ics/smoke test)
72bec9c Merge PR #15 — project-documentation-update
573771b Merge PR #14 — dev_log + AGENTS updates for Phase 3 completion
7adc5d9 Merge PR #13 — mobile-task-views (Phase 3: To-Do mobile UI, Things-style views)
2f44608 Merge PR #12 — task-management-update (Phase 3: tasks smoke test)
2b2d17e Merge PR #11 — task-management-system (Phase 3: tasks routes/controller/recurrence)
63c27df Merge PR #10 — dev_log + AGENTS updates for Phase 2 completion
4c01b58 Merge PR #9 — mail-client-development (Phase 2: Mail module, IMAP/SMTP)
c95ce84 Update storage.ts (MMKV .remove fix, direct on main)
af348db Merge PR #5 — CI workflow, EAS config, Vercel entrypoint, mail.tsx fix
9d625a6 feat: add CI workflow and backend serverless entrypoint
cd61175 Merge PR #4 — plan-phases-log (dev_log.md + AGENTS.md)
b502163 feat: create AGENTS.md documentation
5870fd8 feat: create initial development log
4e8a380 Merge PR #3 — plan-implementation-status
8e6f48b feat: update expo-build-properties with iOS and Android targets
39e5325 Merge PR #2 — v0/rexekit733-7988-4a1b163c
4a7afef Merge PR #1 — phase-one-execution
39733e8 feat: add .env.example and drizzle ORM configuration for backend
8fded88 feat: update OS support to latest major versions for iOS and Android
ca1f604 feat: update platform requirements and testing strategy for SDK 57/RN 0.86
7e05bd8 Add README.md
012a057 feat: add new development plan document (plan.md)
00eb61a Initial commit from v0
```
