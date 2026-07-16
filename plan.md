# Superapp Development Plan (Final — Mobile-Only, Version-Pinned Stack)

**Expo SDK 57 (React Native 0.86, React 19.2) · Node.js 24 LTS + Express 5 + Drizzle 0.45 + PostgreSQL (Neon)**

Modules: Mail (Spark-like) · To-Do (Things 3 / Reminders-like) · Calendar (Fantastical-like) · Notes (Apple Notes-like) · Finance (Revolut/OTP-inspired PFM)

---

## Phase 0 — Project Setup & Architecture (Weeks 1–2)

### 0.1 Repository Structure (single repo, no monorepo)

```
superapp/
├── mobile/                    # Expo SDK 57 (RN 0.86, React 19.2, TypeScript 5.9)
│   ├── app/                   # Expo Router v6 file-based routes
│   │   ├── (tabs)/            # mail, todo, calendar, notes, finance tabs
│   │   └── (auth)/            # login, register, onboarding
│   └── src/
│       ├── modules/           # per-module screens/components/store/api
│       ├── components/        # shared UI library
│       ├── lib/               # api client, utils, Zod 4 schemas
│       └── theme/             # tokens, dark/light mode
├── backend/                   # Node.js 24 LTS + Express 5
│   └── src/
│       ├── routes/            # REST handlers per module
│       ├── controllers/       # business logic
│       ├── db/                # Drizzle ORM 0.45 schema + drizzle-kit 0.31 migrations
│       ├── services/          # Gmail API/Graph/IMAP, bank aggregation, push
│       ├── shared/            # Zod 4 schemas + types (synced to mobile)
│       └── middleware/        # auth (jose JWT), validation, errors
└── docs/
```

**Type sharing without a monorepo:** hand-copy the shared Zod schemas/types between `backend/src/shared/` and `mobile/src/lib/`, or generate an OpenAPI spec from the backend and auto-generate the mobile API client from it.

### 0.2 Tech Stack (pinned, compatibility-verified as of July 2026)

**Mobile — Expo SDK 57 is the anchor:**

| Package | Version | Notes |
|---|---|---|
| Expo SDK | 57 | The anchor — everything else must match it |
| React Native | 0.86 | Fixed by Expo SDK 57 — never install RN manually |
| React | 19.2 | Fixed by Expo SDK 57 |
| TypeScript | ~5.9 | Whatever `create-expo-app` scaffolds for SDK 57 |
| Expo Router | v6 (bundled) | File-based routing, built on React Navigation 7 |
| Zustand | 5.x | Client/UI state (theme, auth state, modal toggles) |
| TanStack Query | 5.x | Server state (caching, mutations, optimistic updates) |
| react-native-mmkv | via `npx expo install` | Fast persistence for Zustand |
| expo-sqlite | SDK 57 version | Offline cache for tasks/notes/events |
| FlashList | v2 | Lists (inbox, tasks, transactions) |
| expo-image, expo-secure-store, expo-notifications, expo-local-authentication, expo-calendar | SDK 57 versions | Always installed via `npx expo install` |
| victory-native | v41+ | Finance charts (Reanimated + Skia based) |

- New Architecture ON (default in SDK 57 — do not opt out)
- **Rule:** every native package installed via `npx expo install` — never plain package-manager add. Upgrades only via `npx expo install expo@latest --fix`.

**Backend:**

| Package | Version | Notes |
|---|---|---|
| Node.js | 24 LTS | Matches Vercel's supported runtime |
| Express | 5.x | Stable; async error handling built in |
| Drizzle ORM | 0.45.x | Stay on stable until 1.0 leaves RC |
| drizzle-kit | 0.31.x | Always bumped together with drizzle-orm |
| @neondatabase/serverless | latest | Neon Postgres driver |
| Zod | 4.x | Same major as mobile (shared schemas) |
| jose | latest | JWT signing/verification |
| argon2 | latest | Password hashing |
| Nodemailer | 7.x | SMTP sending |

**Setup tasks:** scaffold with `create-expo-app` (SDK 57 template), exact-pin versions in both `package.json` files, commit lockfiles, EAS Build + EAS Update configured, backend deployed to Vercel, CI running typecheck + tests on both packages.

### 0.3 Sync Strategy (decide now — #1 rewrite risk if retrofitted)

- expo-sqlite local cache + TanStack Query 5 optimistic updates + background sync
- Schema designed offline-first from day 1: client-generated UUID PKs, `updated_at` conflict detection on all syncable tables
- Heavier option if needed later: PowerSync

### 0.4 Design System

Apple-inspired minimal — clean whitespace, SF-style typography, subtle shadows, rounded corners, neutral palette + one accent color, 8px spacing grid, dark/light mode.

---

## Phase 1 — Superapp Shell & Navigation (Weeks 3–4)

- Expo Router v6 `(tabs)` layout: 5 tabs — Mail, To-Do, Calendar, Notes, Finance; custom Apple-style tab bar; deep linking per module (free with Expo Router)
- Shared component library: buttons, inputs, cards, modals, swipeable rows (Reanimated 4 + Gesture Handler, SDK 57 versions), pull-to-refresh, empty states; theme provider
- Auth: Express 5 + jose JWTs (access/refresh), argon2 hashing, Expo SecureStore for tokens, biometric unlock via expo-local-authentication, onboarding slides
- Push notifications wired early: expo-notifications + Expo Push + FCM
- CI/CD: EAS Build + EAS Update (OTA), backend on Vercel

---

## Phase 2 — Mail Module (Weeks 5–8)

### Architecture
- Providers: Gmail API + Microsoft Graph via OAuth first-class; generic IMAP/SMTP fallback
- Credentials/tokens encrypted at rest in PostgreSQL
- Gmail restricted scopes require Google's CASA security audit before public launch — plan for it

### Features
- Threaded inbox (FlashList v2), compose with rich text + attachments + CC/BCC, search across folders, folder/label management, swipe actions (archive/delete/flag), unread badges, snooze + send later (Spark-style)

### Backend Services
- Nodemailer 7 / AWS SES relay, incremental sync workers (provider webhooks or IMAP IDLE), attachment storage (Blob/S3), new-mail push notifications

---

## Phase 3 — To-Do Module (Weeks 9–11)

- Tasks: title, notes, due date, priority, tags; lists/projects with drag-and-drop (Reanimated 4); subtasks/checklists; recurring tasks (stored as RRULE strings); geofenced location reminders; snooze; logbook with undo
- Things 3-style views: Today / Upcoming / Anytime / Someday / Logbook
- Natural-language quick entry ("tomorrow 9am buy milk")
- Swipe to complete/delete, long-press quick actions, local notifications, home-screen widgets (iOS/Android)

---

## Phase 4 — Calendar Module (Weeks 12–15)

- Day/week/month/agenda views, full RRULE recurrence, configurable reminders, multiple color-coded calendars, time zones, search
- Device-first sync via **expo-calendar** (iOS EventKit / Android Calendar Provider) — users' existing iCloud/Google calendars appear without building OAuth sync
- .ics import/export; natural-language event creation (Fantastical-style)
- **First superapp integration:** tasks with due dates surface inside calendar views

---

## Phase 5 — Notes Module (Weeks 16–19)

- Rich text (bold/italic/underline, lists, headings, images, attachments), drawing/sketching, notebooks/folders, tags, global search, version history
- Editor: verify **10tap-editor** against RN 0.86 / New Architecture first; fallback is a WebView-hosted TipTap editor (version-independent). Either way, store ProseMirror JSON.
- Sync: last-write-wins v1 with conflict detection via `updated_at`; schema ready for Yjs/CRDT migration if collaboration is added later
- Offline: expo-sqlite cache + background sync on reconnect
- Integration: checklists inside notes link to Tasks module

---

## Phase 6 — Finance Module (Weeks 20–24)

### Features
- Account dashboard with balances, transaction feed with categories/filters, spending analytics (victory-native v41 charts), budgets, virtual card display with freeze/unfreeze (mock first), receipt scanning (camera + OCR API), multi-currency (HUF/EUR), recurring-payment detection → creates reminders in Tasks/Calendar

### Backend Services
- Bank aggregation: **GoCardless Bank Account Data or Tink** (both cover OTP + Hungarian banks via PSD2 — Plaid has weak Hungarian coverage)
- Stripe for any in-app payment flows
- Rule-based transaction categorization engine; basic fraud/anomaly rules

### Compliance
- v1 = **PFM only** (read-only aggregation + budgeting): no license needed
- Real P2P transfers, issued cards, or holding balances require an e-money/payment institution license (MNB in Hungary) or a BaaS partner — separate business decision, not a sprint task
- PCI DSS awareness, GDPR (data export/deletion), KYC placeholder flow

---

## Phase 7 — Polish & Launch (Weeks 25–28)

- **Superapp glue:** universal search across modules, cross-module linking (email → task, event ↔ note, transaction → budget), unified "Today" dashboard (agenda + tasks + important emails + spending)
- **Mobile-native polish:** share extension ("share to superapp" from any app), Siri/App Shortcuts, home-screen widgets, App Intents
- **Performance:** lazy-loaded modules, FlashList tuning, cold-start optimization, PostgreSQL indexing + Drizzle query optimization
- **Testing:** Jest + RN Testing Library (unit), Supertest (API), Maestro (E2E), device matrix iOS 15+ / Android 10+
- **Security & release:** pen test (mandatory — mail tokens + finance data), encryption-at-rest audit, 2FA, TestFlight/Play Internal → staged rollout, Sentry (crashes) + PostHog (analytics), EAS Update for OTA fixes

---

## Database Schema Overview (Drizzle 0.45)

Defined in `backend/src/db/schema.ts`, migrations via drizzle-kit 0.31. All syncable tables use client-generated UUID PKs + `updated_at` for offline-first conflict detection.

```ts
// Users & Auth
users: id, email, password_hash, created_at, updated_at
refresh_tokens: id, user_id, token_hash, expires_at

// Per-module account connections (OAuth tokens encrypted)
accounts: id, user_id, type ('mail'|'calendar'|'finance'), provider, config_encrypted, created_at

// Mail
mail_threads: id, account_id, subject, snippet, last_message_at, is_unread
emails: id, thread_id, from_addr, to_addrs_json, body_html, attachments_json, folder, sent_at

// To-Do
task_lists: id, user_id, name, color, sort_order
tasks: id, user_id, list_id, parent_task_id, title, description, due_date,
       scheduled_date, priority, rrule, is_completed, completed_at, sort_order, updated_at

// Calendar
calendars: id, user_id, name, color, external_id
events: id, calendar_id, title, start_time, end_time, all_day, location,
        rrule, reminder_minutes, external_id, updated_at

// Notes
notebooks: id, user_id, name, sort_order
notes: id, user_id, notebook_id, title, content_json (ProseMirror), tags_json,
       version, created_at, updated_at

// Finance
finance_accounts: id, user_id, provider, name, currency, balance, last_synced_at
transactions: id, finance_account_id, amount, currency, category, type, date,
              description, merchant, receipt_url
budgets: id, user_id, category, monthly_limit, period_start
```

---

## Version-Safety Rules

1. Expo SDK 57 dictates all mobile native versions — `npx expo install` only.
2. Upgrade mobile in waves via `npx expo install expo@latest --fix`, never piecemeal.
3. `drizzle-orm` + `drizzle-kit` always bumped together; migrate to Drizzle 1.0 only after it leaves RC.
4. Same Zod 4 major on mobile and backend (shared schemas).
5. Exact version pins + committed lockfiles; Dependabot/Renovate gated by CI.

---

## Biggest Risks

1. **Scope** — each module is a full startup. Ship modules sequentially, not in parallel.
2. **Sync engine** — get offline-first sync right in Phase 0; everything depends on it.
3. **Finance regulation** — real banking needs licensing; start with PFM via open banking (GoCardless/Tink).
4. **Rich text on React Native** — prototype the editor early (10tap vs. WebView TipTap); it's the most common cross-platform pain point.
5. **Mail provider verification** — Gmail CASA audit takes time; start the process well before launch.
