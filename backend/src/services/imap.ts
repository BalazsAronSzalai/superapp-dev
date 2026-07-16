import { ImapFlow } from "imapflow"
import { simpleParser, type ParsedMail } from "mailparser"
import { randomUUID } from "node:crypto"
import { and, eq, inArray, sql } from "drizzle-orm"
import { db, schema } from "../db/index.js"
import { decryptConfig } from "./crypto.js"
import type { CreateMailAccountInput } from "../shared/mail.schemas.js"

export type MailAccountConfig = CreateMailAccountInput

export interface AccountRow {
  id: string
  userId: string
  configEncrypted: string
  lastSyncedUid: unknown
}

export function getAccountConfig(configEncrypted: string): MailAccountConfig {
  return JSON.parse(decryptConfig(configEncrypted)) as MailAccountConfig
}

function createClient(config: MailAccountConfig): ImapFlow {
  return new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapSecure,
    auth: { user: config.username, pass: config.password },
    logger: false,
    // Serverless: fail fast instead of hanging the function.
    socketTimeout: 30_000,
    greetingTimeout: 15_000,
  })
}

/** Throws with a readable message when IMAP credentials are invalid. */
export async function verifyImapCredentials(config: MailAccountConfig): Promise<void> {
  const client = createClient(config)
  try {
    await client.connect()
  } finally {
    await client.logout().catch(() => {})
  }
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

interface SyncFolderSpec {
  /** Local folder value stored on threads/emails. */
  local: "inbox" | "sent"
  /** Candidate IMAP mailbox paths, first match wins. */
  candidates: string[]
}

const SYNC_FOLDERS: SyncFolderSpec[] = [
  { local: "inbox", candidates: ["INBOX"] },
  {
    local: "sent",
    candidates: ["[Gmail]/Sent Mail", "Sent", "Sent Items", "Sent Messages", "INBOX.Sent"],
  },
]

const MAX_MESSAGES_PER_SYNC = 50

interface ParsedAttachmentMeta {
  filename: string
  contentType: string
  size: number
}

function attachmentMeta(parsed: ParsedMail): ParsedAttachmentMeta[] {
  return (parsed.attachments ?? [])
    .filter((a) => a.contentDisposition !== "inline" || a.filename)
    .map((a) => ({
      filename: a.filename ?? "attachment",
      contentType: a.contentType ?? "application/octet-stream",
      size: a.size ?? 0,
    }))
}

function addrList(field: ParsedMail["to"]): string[] {
  if (!field) return []
  const objs = Array.isArray(field) ? field : [field]
  return objs.flatMap((o) => o.value.map((v) => v.address ?? "")).filter(Boolean)
}

function fromAddr(parsed: ParsedMail): string {
  const first = parsed.from?.value?.[0]
  if (!first) return ""
  return first.name ? `${first.name} <${first.address ?? ""}>` : (first.address ?? "")
}

function makeSnippet(parsed: ParsedMail): string {
  const text = (parsed.text ?? "").replace(/\s+/g, " ").trim()
  return text.slice(0, 160)
}

function normalizeSubject(subject: string): string {
  return subject
    .replace(/^((re|fwd?|fw)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase()
}

/**
 * Find the thread an incoming message belongs to:
 * 1. Any referenced Message-ID already stored → that thread.
 * 2. Fallback: same account + same normalized subject.
 */
async function resolveThreadId(
  accountId: string,
  parsed: ParsedMail,
): Promise<string | null> {
  const refs: string[] = []
  if (parsed.inReplyTo) refs.push(parsed.inReplyTo)
  if (parsed.references) {
    refs.push(...(Array.isArray(parsed.references) ? parsed.references : [parsed.references]))
  }
  const uniqueRefs = [...new Set(refs)].filter(Boolean)

  if (uniqueRefs.length > 0) {
    const [match] = await db
      .select({ threadId: schema.emails.threadId })
      .from(schema.emails)
      .innerJoin(schema.mailThreads, eq(schema.emails.threadId, schema.mailThreads.id))
      .where(
        and(
          eq(schema.mailThreads.accountId, accountId),
          inArray(schema.emails.messageId, uniqueRefs),
        ),
      )
      .limit(1)
    if (match) return match.threadId
  }

  const subject = normalizeSubject(parsed.subject ?? "")
  if (subject.length > 0 && (parsed.inReplyTo || parsed.references)) {
    const [match] = await db
      .select({ id: schema.mailThreads.id })
      .from(schema.mailThreads)
      .where(
        and(
          eq(schema.mailThreads.accountId, accountId),
          sql`lower(regexp_replace(${schema.mailThreads.subject}, '^((re|fwd?|fw)\\s*:\\s*)+', '', 'i')) = ${subject}`,
        ),
      )
      .limit(1)
    if (match) return match.id
  }

  return null
}

async function upsertMessage(
  accountId: string,
  localFolder: "inbox" | "sent",
  uid: number,
  raw: Buffer,
  seen: boolean,
): Promise<void> {
  const parsed = await simpleParser(raw)
  const messageId = parsed.messageId ?? null

  // Dedupe by Message-ID within the account.
  if (messageId) {
    const [existing] = await db
      .select({ id: schema.emails.id })
      .from(schema.emails)
      .innerJoin(schema.mailThreads, eq(schema.emails.threadId, schema.mailThreads.id))
      .where(
        and(eq(schema.mailThreads.accountId, accountId), eq(schema.emails.messageId, messageId)),
      )
      .limit(1)
    if (existing) return
  }

  const sentAt = parsed.date ?? new Date()
  const snippet = makeSnippet(parsed)
  const subject = parsed.subject ?? ""
  const isOutbound = localFolder === "sent"

  let threadId = await resolveThreadId(accountId, parsed)

  if (threadId) {
    await db
      .update(schema.mailThreads)
      .set({
        snippet: snippet || undefined,
        lastMessageAt: sql`greatest(coalesce(${schema.mailThreads.lastMessageAt}, ${sentAt.toISOString()}::timestamptz), ${sentAt.toISOString()}::timestamptz)`,
        isUnread: !isOutbound && !seen ? true : undefined,
        messageCount: sql`${schema.mailThreads.messageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.mailThreads.id, threadId))
  } else {
    threadId = randomUUID()
    await db.insert(schema.mailThreads).values({
      id: threadId,
      accountId,
      subject,
      snippet,
      lastMessageAt: sentAt,
      isUnread: !isOutbound && !seen,
      folder: isOutbound ? "sent" : "inbox",
      messageCount: 1,
    })
  }

  await db.insert(schema.emails).values({
    id: randomUUID(),
    threadId,
    fromAddr: fromAddr(parsed),
    toAddrsJson: addrList(parsed.to),
    ccAddrsJson: addrList(parsed.cc),
    bccAddrsJson: [],
    bodyHtml: typeof parsed.html === "string" ? parsed.html : null,
    bodyText: parsed.text ?? null,
    attachmentsJson: attachmentMeta(parsed),
    folder: localFolder,
    messageId,
    imapUid: uid,
    isOutbound,
    sentAt,
  })
}

export interface SyncResult {
  synced: number
  folders: Record<string, number>
}

/** Incremental sync: fetch messages with UID > last synced for each folder. */
export async function syncAccount(account: AccountRow): Promise<SyncResult> {
  const config = getAccountConfig(account.configEncrypted)
  const lastSynced = (account.lastSyncedUid ?? {}) as Record<string, number>
  const client = createClient(config)
  const result: SyncResult = { synced: 0, folders: {} }

  await client.connect()
  try {
    const mailboxes = await client.list()
    const available = new Set(mailboxes.map((m) => m.path))

    for (const spec of SYNC_FOLDERS) {
      const path = spec.candidates.find((c) => available.has(c))
      if (!path) continue

      const lock = await client.getMailboxLock(path)
      try {
        const sinceUid = lastSynced[path] ?? 0
        const range = sinceUid > 0 ? `${sinceUid + 1}:*` : "1:*"
        // Collect matching UIDs first (newest last), cap per sync.
        const uids = await client.search({ uid: range }, { uid: true })
        const uidList = (uids || [])
          .filter((u) => u > sinceUid)
          .sort((a, b) => a - b)
          .slice(-MAX_MESSAGES_PER_SYNC)

        let maxUid = sinceUid
        for (const uid of uidList) {
          const msg = await client.fetchOne(
            String(uid),
            { source: true, flags: true },
            { uid: true },
          )
          if (!msg || !msg.source) continue
          const seen = msg.flags?.has("\\Seen") ?? false
          await upsertMessage(account.id, spec.local, uid, msg.source, seen)
          result.synced += 1
          if (uid > maxUid) maxUid = uid
        }
        result.folders[path] = uidList.length
        lastSynced[path] = maxUid
      } finally {
        lock.release()
      }
    }
  } finally {
    await client.logout().catch(() => {})
  }

  await db
    .update(schema.accounts)
    .set({ lastSyncedUid: lastSynced })
    .where(eq(schema.accounts.id, account.id))

  return result
}

// ---------------------------------------------------------------------------
// Mirror flag/move operations to the IMAP server (best-effort)
// ---------------------------------------------------------------------------

async function withInbox<T>(
  configEncrypted: string,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const config = getAccountConfig(configEncrypted)
  const client = createClient(config)
  await client.connect()
  try {
    const lock = await client.getMailboxLock("INBOX")
    try {
      return await fn(client)
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
}

export async function mirrorSeenFlag(
  configEncrypted: string,
  uids: number[],
  seen: boolean,
): Promise<void> {
  if (uids.length === 0) return
  await withInbox(configEncrypted, async (client) => {
    const range = uids.join(",")
    if (seen) await client.messageFlagsAdd(range, ["\\Seen"], { uid: true })
    else await client.messageFlagsRemove(range, ["\\Seen"], { uid: true })
  })
}

export async function mirrorFlagged(
  configEncrypted: string,
  uids: number[],
  flagged: boolean,
): Promise<void> {
  if (uids.length === 0) return
  await withInbox(configEncrypted, async (client) => {
    const range = uids.join(",")
    if (flagged) await client.messageFlagsAdd(range, ["\\Flagged"], { uid: true })
    else await client.messageFlagsRemove(range, ["\\Flagged"], { uid: true })
  })
}

const ARCHIVE_CANDIDATES = ["[Gmail]/All Mail", "Archive", "Archived"]
const TRASH_CANDIDATES = ["[Gmail]/Trash", "Trash", "Deleted Items", "Deleted Messages"]

export async function mirrorMove(
  configEncrypted: string,
  uids: number[],
  destination: "archive" | "trash",
): Promise<void> {
  if (uids.length === 0) return
  const config = getAccountConfig(configEncrypted)
  const client = createClient(config)
  await client.connect()
  try {
    const mailboxes = await client.list()
    const available = new Set(mailboxes.map((m) => m.path))
    const candidates = destination === "archive" ? ARCHIVE_CANDIDATES : TRASH_CANDIDATES
    const target = candidates.find((c) => available.has(c))
    if (!target) return

    const lock = await client.getMailboxLock("INBOX")
    try {
      await client.messageMove(uids.join(","), target, { uid: true })
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
}

// ---------------------------------------------------------------------------
// On-demand attachment download
// ---------------------------------------------------------------------------

export interface DownloadedAttachment {
  filename: string
  contentType: string
  content: Buffer
}

/** Re-fetch a message from IMAP and extract one attachment by index. */
export async function fetchAttachment(
  configEncrypted: string,
  localFolder: string,
  uid: number,
  attachmentIndex: number,
): Promise<DownloadedAttachment | null> {
  const config = getAccountConfig(configEncrypted)
  const client = createClient(config)
  await client.connect()
  try {
    const mailboxes = await client.list()
    const available = new Set(mailboxes.map((m) => m.path))
    const spec = SYNC_FOLDERS.find((s) => s.local === localFolder) ?? SYNC_FOLDERS[0]!
    const path = spec.candidates.find((c) => available.has(c)) ?? "INBOX"

    const lock = await client.getMailboxLock(path)
    try {
      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true })
      if (!msg || !msg.source) return null
      const parsed = await simpleParser(msg.source)
      const attachments = (parsed.attachments ?? []).filter(
        (a) => a.contentDisposition !== "inline" || a.filename,
      )
      const attachment = attachments[attachmentIndex]
      if (!attachment) return null
      return {
        filename: attachment.filename ?? "attachment",
        contentType: attachment.contentType ?? "application/octet-stream",
        content: attachment.content,
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
}
