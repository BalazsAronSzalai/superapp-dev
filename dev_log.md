# Development Log — Superapp

**Date:** 2026-07-16 (updated after PR #5 merge)
**Branch:** v0/morovo9733-1176-da457a9b (base: main @ c95ce84)
**Reference:** plan.md (Final — Mobile-Only, Version-Pinned Stack)

---

## Phase Status Summary

| Phase | Name | Status |
|---|---|---|
| Phase 0 | Project Setup & Architecture | ✅ Complete |
| Phase 1 | Superapp Shell & Navigation | ✅ Complete (pending live Vercel deploy verification) |
| Phase 2 | Mail Module | ❌ Not started |
| Phase 3 | To-Do Module | ❌ Not started (placeholder only) |
| Phase 4 | Calendar Module | ❌ Not started (placeholder only) |
| Phase 5 | Notes Module | ❌ Not started (placeholder only) |
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

## Phases 2–6 — Modules ❌

- All module tab screens (To-Do, Calendar, Notes, Finance) render `ModulePlaceholder` ("coming soon").
- Backend has only the auth router mounted; module routers are stubbed as comments in `src/index.ts` (`/api/mail`, `/api/tasks`, `/api/calendar`, `/api/notes`, `/api/finance`).
- Database schema for all modules exists (done ahead of time in Phase 0), but no controllers, services, or sync logic.
- No provider integrations yet (Gmail/Graph/IMAP, expo-calendar sync, GoCardless/Tink, rich-text editor).

## Phase 7 — Polish & Launch ❌

- No universal search, cross-module linking, Today dashboard, widgets, tests, or release tooling yet.

---

## Recommended Next Steps

1. Deploy the backend to Vercel and verify `/api/health` (or the auth routes) respond in production; set `DATABASE_URL` + JWT secrets as Vercel env vars.
2. Run the initial Drizzle migration against the production Neon database if not already applied.
3. Begin Phase 2 (Mail module) per plan — modules ship sequentially: mail routes/controller on the backend (mount at the `/api/mail` stub), provider integration (Gmail/Graph/IMAP), then the mobile inbox UI (FlashList v2) replacing the Mail placeholder.

---

## Git History Reference

```
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
