import type { Request, Response } from "express"
import { and, desc, eq, gt, ilike, inArray, isNull, lte, lt, or, sql } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db, schema } from "../db/index.js"
import { HttpError } from "../middleware/errors.js"
import { encryptConfig } from "../services/crypto.js"
import {
  getAccountConfig,
  verifyImapCredentials,
  syncAccount,
  mirrorSeenFlag,
  mirrorFlagged,
  mirrorMove,
  fetchAttachment,
} from "../services/imap.js"
import { verifySmtpCredentials, sendMail } from "../services/smtp.js"
import type {
  CreateMailAccountInput,
  PatchThreadInput,
  SnoozeThreadInput,
  SendMailInput,
  MailAccount,
  MailThread,
  EmailMessage,
  AttachmentMeta,
} from "../shared/mail.schemas.js"

const MAX_ATTACHMENT_PAYLOAD_BYTES = 10 * 1024 * 1024 // ~10 MB decoded

/** Express 5 types route params as string | string[]; normalize to string. */
function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "")
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getOwnedAccount(userId: string, accountId: string) {
  const [account] = await db
    .select()
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.id, accountId),
        eq(schema.accounts.userId, userId),
        eq(schema.accounts.type, "mail"),
      ),
    )
    .limit(1)
  if (!account) throw new HttpError(404, "Mail account not found")
  return account
}

async function getUserAccountIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.type, "mail")))
  return rows.map((r) => r.id)
}

async function getOwnedThread(userId: string, threadId: string) {
  const [row] = await db
    .select({ thread: schema.mailThreads, account: schema.accounts })
    .from(schema.mailThreads)
    .innerJoin(schema.accounts, eq(schema.mailThreads.accountId, schema.accounts.id))
    .where(and(eq(schema.mailThreads.id, threadId), eq(schema.accounts.userId, userId)))
    .limit(1)
  if (!row) throw new HttpError(404, "Thread not found")
  return row
}

function toAccountDto(row: typeof schema.accounts.$inferSelect): MailAccount {
  return {
    id: row.id,
    email: row.emailAddr ?? "",
    displayName: row.displayName,
    provider: row.provider,
    createdAt: row.createdAt.toISOString(),
  }
}

function toThreadDto(
  row: typeof schema.mailThreads.$inferSelect,
  fromAddr: string | null,
  hasAttachments?: boolean,
): MailThread {
  return {
    id: row.id,
    accountId: row.accountId,
    subject: row.subject,
    snippet: row.snippet,
    fromAddr,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    isUnread: row.isUnread,
    isFlagged: row.isFlagged,
    folder: row.folder,
    snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
    messageCount: row.messageCount,
    hasAttachments,
  }
}

function toEmailDto(row: typeof schema.emails.$inferSelect): EmailMessage {
  return {
    id: row.id,
    threadId: row.threadId,
    fromAddr: row.fromAddr,
    to: (row.toAddrsJson as string[]) ?? [],
    cc: (row.ccAddrsJson as string[]) ?? [],
    bodyHtml: row.bodyHtml,
    bodyText: row.bodyText,
    attachments: (row.attachmentsJson as AttachmentMeta[]) ?? [],
    folder: row.folder,
    messageId: row.messageId,
    isOutbound: row.isOutbound,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
  }
}

/** Latest inbound sender per thread, for the list view. */
async function latestSenders(threadIds: string[]): Promise<Map<string, string>> {
  if (threadIds.length === 0) return new Map()
  const rows = await db
    .selectDistinctOn([schema.emails.threadId], {
      threadId: schema.emails.threadId,
      fromAddr: schema.emails.fromAddr,
    })
    .from(schema.emails)
    .where(inArray(schema.emails.threadId, threadIds))
    .orderBy(schema.emails.threadId, desc(schema.emails.sentAt))
  return new Map(rows.map((r) => [r.threadId, r.fromAddr]))
}

async function attachmentPresence(threadIds: string[]): Promise<Set<string>> {
  if (threadIds.length === 0) return new Set()
  const rows = await db
    .select({ threadId: schema.emails.threadId })
    .from(schema.emails)
    .where(
      and(
        inArray(schema.emails.threadId, threadIds),
        sql`jsonb_array_length(${schema.emails.attachmentsJson}) > 0`,
      ),
    )
  return new Set(rows.map((r) => r.threadId))
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function createAccount(req: Request, res: Response) {
  const input = req.body as CreateMailAccountInput

  try {
    await verifyImapCredentials(input)
  } catch (err) {
    throw new HttpError(422, `IMAP connection failed: ${(err as Error).message}`)
  }
  try {
    await verifySmtpCredentials(input)
  } catch (err) {
    throw new HttpError(422, `SMTP connection failed: ${(err as Error).message}`)
  }

  const [account] = await db
    .insert(schema.accounts)
    .values({
      userId: req.userId!,
      type: "mail",
      provider: "imap",
      configEncrypted: encryptConfig(JSON.stringify(input)),
      emailAddr: input.email,
      displayName: input.displayName ?? null,
      lastSyncedUid: {},
    })
    .returning()
  if (!account) throw new HttpError(500, "Failed to create account")

  res.status(201).json({ account: toAccountDto(account) })
}

export async function listAccounts(req: Request, res: Response) {
  const rows = await db
    .select()
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, req.userId!), eq(schema.accounts.type, "mail")))
    .orderBy(schema.accounts.createdAt)
  res.json({ accounts: rows.map(toAccountDto) })
}

export async function deleteAccount(req: Request, res: Response) {
  const account = await getOwnedAccount(req.userId!, param(req.params.id))
  await db.delete(schema.accounts).where(eq(schema.accounts.id, account.id))
  res.status(204).end()
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export async function syncAccountHandler(req: Request, res: Response) {
  const account = await getOwnedAccount(req.userId!, param(req.params.id))

  // Opportunistically deliver due scheduled messages on every sync.
  const scheduled = await processScheduledForUser(req.userId!)

  let result
  try {
    result = await syncAccount({
      id: account.id,
      userId: account.userId,
      configEncrypted: account.configEncrypted,
      lastSyncedUid: account.lastSyncedUid,
    })
  } catch (err) {
    throw new HttpError(502, `Sync failed: ${(err as Error).message}`)
  }

  res.json({ ...result, scheduledSent: scheduled })
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

const PAGE_SIZE = 30

export async function listThreads(req: Request, res: Response) {
  const folder = (req.query.folder as string | undefined) ?? "inbox"
  const cursor = req.query.cursor as string | undefined
  const accountIds = await getUserAccountIds(req.userId!)
  if (accountIds.length === 0) {
    res.json({ threads: [], nextCursor: null })
    return
  }

  const now = new Date()
  const conditions = [inArray(schema.mailThreads.accountId, accountIds)]

  if (folder === "snoozed") {
    conditions.push(gt(schema.mailThreads.snoozedUntil, now))
  } else if (folder === "inbox") {
    conditions.push(eq(schema.mailThreads.folder, "inbox"))
    conditions.push(
      or(
        isNull(schema.mailThreads.snoozedUntil),
        lte(schema.mailThreads.snoozedUntil, now),
      )!,
    )
  } else {
    conditions.push(eq(schema.mailThreads.folder, folder))
  }

  if (cursor) {
    const cursorDate = new Date(cursor)
    if (!Number.isNaN(cursorDate.getTime())) {
      conditions.push(lt(schema.mailThreads.lastMessageAt, cursorDate))
    }
  }

  const rows = await db
    .select()
    .from(schema.mailThreads)
    .where(and(...conditions))
    .orderBy(desc(schema.mailThreads.lastMessageAt))
    .limit(PAGE_SIZE + 1)

  const page = rows.slice(0, PAGE_SIZE)
  const nextCursor =
    rows.length > PAGE_SIZE
      ? (page[page.length - 1]?.lastMessageAt?.toISOString() ?? null)
      : null

  const ids = page.map((t) => t.id)
  const [senders, withAttachments] = await Promise.all([
    latestSenders(ids),
    attachmentPresence(ids),
  ])

  res.json({
    threads: page.map((t) =>
      toThreadDto(t, senders.get(t.id) ?? null, withAttachments.has(t.id)),
    ),
    nextCursor,
  })
}

export async function getThread(req: Request, res: Response) {
  const { thread } = await getOwnedThread(req.userId!, param(req.params.id))

  const emailRows = await db
    .select()
    .from(schema.emails)
    .where(eq(schema.emails.threadId, thread.id))
    .orderBy(schema.emails.sentAt)

  const senders = await latestSenders([thread.id])
  res.json({
    thread: toThreadDto(thread, senders.get(thread.id) ?? null),
    emails: emailRows.map(toEmailDto),
  })
}

async function inboxUids(threadId: string): Promise<number[]> {
  const rows = await db
    .select({ uid: schema.emails.imapUid })
    .from(schema.emails)
    .where(and(eq(schema.emails.threadId, threadId), eq(schema.emails.folder, "inbox")))
  return rows.map((r) => r.uid).filter((u): u is number => u != null)
}

export async function patchThread(req: Request, res: Response) {
  const input = req.body as PatchThreadInput
  const { thread, account } = await getOwnedThread(req.userId!, param(req.params.id))

  const set: Partial<typeof schema.mailThreads.$inferInsert> = { updatedAt: new Date() }
  if (input.isUnread !== undefined) set.isUnread = input.isUnread
  if (input.isFlagged !== undefined) set.isFlagged = input.isFlagged
  if (input.folder !== undefined) set.folder = input.folder

  await db.update(schema.mailThreads).set(set).where(eq(schema.mailThreads.id, thread.id))

  // Mirror to IMAP, best-effort (do not fail the request on IMAP hiccups).
  try {
    const uids = await inboxUids(thread.id)
    if (input.isUnread !== undefined) {
      await mirrorSeenFlag(account.configEncrypted, uids, !input.isUnread)
    }
    if (input.isFlagged !== undefined) {
      await mirrorFlagged(account.configEncrypted, uids, input.isFlagged)
    }
    if (input.folder === "archive" || input.folder === "trash") {
      await mirrorMove(account.configEncrypted, uids, input.folder)
    }
  } catch (err) {
    console.error("[backend] IMAP mirror failed:", (err as Error).message)
  }

  const [updated] = await db
    .select()
    .from(schema.mailThreads)
    .where(eq(schema.mailThreads.id, thread.id))
    .limit(1)
  const senders = await latestSenders([thread.id])
  res.json({ thread: toThreadDto(updated!, senders.get(thread.id) ?? null) })
}

export async function deleteThread(req: Request, res: Response) {
  const { thread, account } = await getOwnedThread(req.userId!, param(req.params.id))

  if (thread.folder === "trash") {
    // Permanent local delete.
    await db.delete(schema.mailThreads).where(eq(schema.mailThreads.id, thread.id))
  } else {
    await db
      .update(schema.mailThreads)
      .set({ folder: "trash", updatedAt: new Date() })
      .where(eq(schema.mailThreads.id, thread.id))
    try {
      const uids = await inboxUids(thread.id)
      await mirrorMove(account.configEncrypted, uids, "trash")
    } catch (err) {
      console.error("[backend] IMAP mirror failed:", (err as Error).message)
    }
  }
  res.status(204).end()
}

export async function snoozeThread(req: Request, res: Response) {
  const { until } = req.body as SnoozeThreadInput
  const { thread } = await getOwnedThread(req.userId!, param(req.params.id))
  const snoozedUntil = new Date(until)
  if (snoozedUntil.getTime() <= Date.now()) {
    throw new HttpError(400, "Snooze time must be in the future")
  }
  await db
    .update(schema.mailThreads)
    .set({ snoozedUntil, updatedAt: new Date() })
    .where(eq(schema.mailThreads.id, thread.id))
  res.status(204).end()
}

export async function unsnoozeThread(req: Request, res: Response) {
  const { thread } = await getOwnedThread(req.userId!, param(req.params.id))
  await db
    .update(schema.mailThreads)
    .set({ snoozedUntil: null, updatedAt: new Date() })
    .where(eq(schema.mailThreads.id, thread.id))
  res.status(204).end()
}

export async function unreadCount(req: Request, res: Response) {
  const accountIds = await getUserAccountIds(req.userId!)
  if (accountIds.length === 0) {
    res.json({ count: 0 })
    return
  }
  const now = new Date()
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.mailThreads)
    .where(
      and(
        inArray(schema.mailThreads.accountId, accountIds),
        eq(schema.mailThreads.folder, "inbox"),
        eq(schema.mailThreads.isUnread, true),
        or(
          isNull(schema.mailThreads.snoozedUntil),
          lte(schema.mailThreads.snoozedUntil, now),
        ),
      ),
    )
  res.json({ count: row?.count ?? 0 })
}

// ---------------------------------------------------------------------------
// Send + scheduled delivery
// ---------------------------------------------------------------------------

function totalAttachmentBytes(input: SendMailInput): number {
  // base64 → bytes: 3/4 ratio.
  return input.attachments.reduce(
    (sum, a) => sum + Math.floor((a.contentBase64.length * 3) / 4),
    0,
  )
}

export async function send(req: Request, res: Response) {
  const input = req.body as SendMailInput
  const account = await getOwnedAccount(req.userId!, input.accountId)

  if (totalAttachmentBytes(input) > MAX_ATTACHMENT_PAYLOAD_BYTES) {
    throw new HttpError(413, "Attachments exceed the 10 MB limit")
  }

  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null
  const isScheduled = scheduledAt != null && scheduledAt.getTime() > Date.now()

  // Resolve or create the thread.
  let threadId = input.threadId ?? null
  if (threadId) {
    await getOwnedThread(req.userId!, threadId)
  } else {
    threadId = randomUUID()
    await db.insert(schema.mailThreads).values({
      id: threadId,
      accountId: account.id,
      subject: input.subject,
      snippet: input.bodyText.replace(/\s+/g, " ").trim().slice(0, 160),
      lastMessageAt: new Date(),
      isUnread: false,
      folder: isScheduled ? "outbox" : "sent",
      messageCount: 0,
    })
  }

  const emailId = randomUUID()
  const config = getAccountConfig(account.configEncrypted)

  if (isScheduled) {
    await db.insert(schema.emails).values({
      id: emailId,
      threadId,
      fromAddr: config.displayName
        ? `${config.displayName} <${config.email}>`
        : config.email,
      toAddrsJson: input.to,
      ccAddrsJson: input.cc,
      bccAddrsJson: input.bcc,
      bodyText: input.bodyText,
      attachmentsJson: input.attachments.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        size: Math.floor((a.contentBase64.length * 3) / 4),
        contentBase64: a.contentBase64,
      })),
      folder: "outbox",
      messageId: input.inReplyTo ?? null,
      isOutbound: true,
      scheduledAt,
    })
    await bumpThread(threadId, input.bodyText)
    res.status(202).json({ id: emailId, status: "scheduled" })
    return
  }

  let sent
  try {
    sent = await sendMail(config, {
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      bodyText: input.bodyText,
      inReplyTo: input.inReplyTo,
      attachments: input.attachments,
    })
  } catch (err) {
    throw new HttpError(502, `Send failed: ${(err as Error).message}`)
  }

  await db.insert(schema.emails).values({
    id: emailId,
    threadId,
    fromAddr: config.displayName ? `${config.displayName} <${config.email}>` : config.email,
    toAddrsJson: input.to,
    ccAddrsJson: input.cc,
    bccAddrsJson: input.bcc,
    bodyText: input.bodyText,
    attachmentsJson: input.attachments.map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      size: Math.floor((a.contentBase64.length * 3) / 4),
    })),
    folder: "sent",
    messageId: sent.messageId,
    isOutbound: true,
    sentAt: new Date(),
  })
  await bumpThread(threadId, input.bodyText)

  res.status(201).json({ id: emailId, status: "sent" })
}

async function bumpThread(threadId: string, bodyText: string) {
  await db
    .update(schema.mailThreads)
    .set({
      snippet: bodyText.replace(/\s+/g, " ").trim().slice(0, 160),
      lastMessageAt: new Date(),
      messageCount: sql`${schema.mailThreads.messageCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(schema.mailThreads.id, threadId))
}

interface StoredOutboxAttachment {
  filename: string
  contentType: string
  size: number
  contentBase64?: string
}

/** Send all due outbox messages for one user's accounts. Returns count sent. */
async function processScheduledForUser(userId: string): Promise<number> {
  const accountIds = await getUserAccountIds(userId)
  if (accountIds.length === 0) return 0
  return processScheduledInternal(accountIds)
}

async function processScheduledInternal(accountIds: string[] | null): Promise<number> {
  const now = new Date()
  const conditions = [
    eq(schema.emails.folder, "outbox"),
    lte(schema.emails.scheduledAt, now),
  ]

  const rows = await db
    .select({
      email: schema.emails,
      thread: schema.mailThreads,
      account: schema.accounts,
    })
    .from(schema.emails)
    .innerJoin(schema.mailThreads, eq(schema.emails.threadId, schema.mailThreads.id))
    .innerJoin(schema.accounts, eq(schema.mailThreads.accountId, schema.accounts.id))
    .where(
      and(
        ...conditions,
        ...(accountIds ? [inArray(schema.mailThreads.accountId, accountIds)] : []),
      ),
    )
    .limit(10)

  let sentCount = 0
  for (const { email, thread, account } of rows) {
    try {
      const config = getAccountConfig(account.configEncrypted)
      const attachments = ((email.attachmentsJson as StoredOutboxAttachment[]) ?? [])
        .filter((a) => a.contentBase64)
        .map((a) => ({
          filename: a.filename,
          contentType: a.contentType,
          contentBase64: a.contentBase64!,
        }))
      const sent = await sendMail(config, {
        to: (email.toAddrsJson as string[]) ?? [],
        cc: (email.ccAddrsJson as string[]) ?? [],
        bcc: (email.bccAddrsJson as string[]) ?? [],
        subject: thread.subject,
        bodyText: email.bodyText ?? "",
        attachments,
      })
      await db
        .update(schema.emails)
        .set({
          folder: "sent",
          sentAt: new Date(),
          scheduledAt: null,
          messageId: sent.messageId,
          // Drop attachment payloads once delivered; keep metadata only.
          attachmentsJson: ((email.attachmentsJson as StoredOutboxAttachment[]) ?? []).map(
            ({ filename, contentType, size }) => ({ filename, contentType, size }),
          ),
          updatedAt: new Date(),
        })
        .where(eq(schema.emails.id, email.id))
      if (thread.folder === "outbox") {
        await db
          .update(schema.mailThreads)
          .set({ folder: "sent", updatedAt: new Date() })
          .where(eq(schema.mailThreads.id, thread.id))
      }
      sentCount += 1
    } catch (err) {
      console.error("[backend] Scheduled send failed:", (err as Error).message)
    }
  }
  return sentCount
}

/**
 * Cron + opportunistic endpoint. Auth: either a valid user bearer token
 * (processes that user's outbox) or the CRON_SECRET (processes everything).
 */
export async function processScheduled(req: Request, res: Response) {
  if (req.userId) {
    const sent = await processScheduledForUser(req.userId)
    res.json({ sent })
    return
  }
  const sent = await processScheduledInternal(null)
  res.json({ sent })
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function search(req: Request, res: Response) {
  const q = ((req.query.q as string | undefined) ?? "").trim()
  if (q.length === 0) {
    res.json({ threads: [], nextCursor: null })
    return
  }
  const accountIds = await getUserAccountIds(req.userId!)
  if (accountIds.length === 0) {
    res.json({ threads: [], nextCursor: null })
    return
  }

  const pattern = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`

  const matchingThreadIds = await db
    .selectDistinct({ id: schema.mailThreads.id })
    .from(schema.mailThreads)
    .leftJoin(schema.emails, eq(schema.emails.threadId, schema.mailThreads.id))
    .where(
      and(
        inArray(schema.mailThreads.accountId, accountIds),
        or(
          ilike(schema.mailThreads.subject, pattern),
          ilike(schema.mailThreads.snippet, pattern),
          ilike(schema.emails.fromAddr, pattern),
          ilike(schema.emails.bodyText, pattern),
        ),
      ),
    )
    .limit(50)

  const ids = matchingThreadIds.map((r) => r.id)
  if (ids.length === 0) {
    res.json({ threads: [], nextCursor: null })
    return
  }

  const rows = await db
    .select()
    .from(schema.mailThreads)
    .where(inArray(schema.mailThreads.id, ids))
    .orderBy(desc(schema.mailThreads.lastMessageAt))

  const senders = await latestSenders(ids)
  res.json({
    threads: rows.map((t) => toThreadDto(t, senders.get(t.id) ?? null)),
    nextCursor: null,
  })
}

// ---------------------------------------------------------------------------
// Attachments (on-demand download from IMAP)
// ---------------------------------------------------------------------------

export async function downloadAttachment(req: Request, res: Response) {
  const emailId = param(req.params.id)
  const index = Number.parseInt(param(req.params.index), 10)
  if (Number.isNaN(index) || index < 0) throw new HttpError(400, "Invalid attachment index")

  const [row] = await db
    .select({
      email: schema.emails,
      account: schema.accounts,
    })
    .from(schema.emails)
    .innerJoin(schema.mailThreads, eq(schema.emails.threadId, schema.mailThreads.id))
    .innerJoin(schema.accounts, eq(schema.mailThreads.accountId, schema.accounts.id))
    .where(and(eq(schema.emails.id, emailId), eq(schema.accounts.userId, req.userId!)))
    .limit(1)
  if (!row) throw new HttpError(404, "Email not found")

  const metas = (row.email.attachmentsJson as StoredOutboxAttachment[]) ?? []
  const meta = metas[index]
  if (!meta) throw new HttpError(404, "Attachment not found")

  // Outbox attachments still carry their payload locally.
  if (meta.contentBase64) {
    res
      .setHeader("Content-Type", meta.contentType)
      .setHeader("Content-Disposition", `attachment; filename="${meta.filename}"`)
      .send(Buffer.from(meta.contentBase64, "base64"))
    return
  }

  if (row.email.imapUid == null) throw new HttpError(404, "Attachment content unavailable")

  let attachment
  try {
    attachment = await fetchAttachment(
      row.account.configEncrypted,
      row.email.folder,
      row.email.imapUid,
      index,
    )
  } catch (err) {
    throw new HttpError(502, `Attachment download failed: ${(err as Error).message}`)
  }
  if (!attachment) throw new HttpError(404, "Attachment not found on server")

  res
    .setHeader("Content-Type", attachment.contentType)
    .setHeader("Content-Disposition", `attachment; filename="${attachment.filename}"`)
    .send(attachment.content)
}
