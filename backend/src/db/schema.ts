import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"

// ---------------------------------------------------------------------------
// Users & Auth
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
)

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("refresh_tokens_user_id_idx").on(t.userId)],
)

// ---------------------------------------------------------------------------
// Per-module account connections (OAuth tokens encrypted at rest)
// ---------------------------------------------------------------------------

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["mail", "calendar", "finance"] }).notNull(),
    provider: text("provider").notNull(),
    configEncrypted: text("config_encrypted").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
)

// ---------------------------------------------------------------------------
// Mail
// ---------------------------------------------------------------------------

export const mailThreads = pgTable(
  "mail_threads",
  {
    id: uuid("id").primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    subject: text("subject").notNull().default(""),
    snippet: text("snippet").notNull().default(""),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    isUnread: boolean("is_unread").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("mail_threads_account_id_idx").on(t.accountId)],
)

export const emails = pgTable(
  "emails",
  {
    id: uuid("id").primaryKey(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => mailThreads.id, { onDelete: "cascade" }),
    fromAddr: text("from_addr").notNull(),
    toAddrsJson: jsonb("to_addrs_json").notNull().default([]),
    bodyHtml: text("body_html"),
    attachmentsJson: jsonb("attachments_json").notNull().default([]),
    folder: text("folder").notNull().default("inbox"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("emails_thread_id_idx").on(t.threadId)],
)

// ---------------------------------------------------------------------------
// To-Do
// ---------------------------------------------------------------------------

export const taskLists = pgTable(
  "task_lists",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_lists_user_id_idx").on(t.userId)],
)

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    listId: uuid("list_id").references(() => taskLists.id, { onDelete: "set null" }),
    parentTaskId: uuid("parent_task_id"),
    title: text("title").notNull(),
    description: text("description"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    scheduledDate: timestamp("scheduled_date", { withTimezone: true }),
    priority: integer("priority").notNull().default(0),
    rrule: text("rrule"),
    isCompleted: boolean("is_completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tasks_user_id_idx").on(t.userId),
    index("tasks_list_id_idx").on(t.listId),
  ],
)

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export const calendars = pgTable(
  "calendars",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    externalId: text("external_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("calendars_user_id_idx").on(t.userId)],
)

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    location: text("location"),
    rrule: text("rrule"),
    reminderMinutes: integer("reminder_minutes"),
    externalId: text("external_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_calendar_id_idx").on(t.calendarId),
    index("events_start_time_idx").on(t.startTime),
  ],
)

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export const notebooks = pgTable(
  "notebooks",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notebooks_user_id_idx").on(t.userId)],
)

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    notebookId: uuid("notebook_id").references(() => notebooks.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull().default(""),
    contentJson: jsonb("content_json").notNull().default({}),
    tagsJson: jsonb("tags_json").notNull().default([]),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notes_user_id_idx").on(t.userId),
    index("notes_notebook_id_idx").on(t.notebookId),
  ],
)

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------

export const financeAccounts = pgTable(
  "finance_accounts",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    name: text("name").notNull(),
    currency: text("currency").notNull().default("HUF"),
    balance: numeric("balance", { precision: 14, scale: 2 }).notNull().default("0"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("finance_accounts_user_id_idx").on(t.userId)],
)

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey(),
    financeAccountId: uuid("finance_account_id")
      .notNull()
      .references(() => financeAccounts.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("HUF"),
    category: text("category"),
    type: text("type", { enum: ["debit", "credit"] }).notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    description: text("description"),
    merchant: text("merchant"),
    receiptUrl: text("receipt_url"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transactions_finance_account_id_idx").on(t.financeAccountId),
    index("transactions_date_idx").on(t.date),
  ],
)

export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    monthlyLimit: numeric("monthly_limit", { precision: 14, scale: 2 }).notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("budgets_user_id_idx").on(t.userId)],
)

// ---------------------------------------------------------------------------
// Push notification tokens (wired early per Phase 1)
// ---------------------------------------------------------------------------

export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    platform: text("platform", { enum: ["ios", "android"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("push_tokens_token_idx").on(t.token)],
)
