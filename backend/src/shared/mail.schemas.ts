// Shared Zod 4 schemas for the Mail module.
// Hand-copied to mobile/src/lib/schemas/mail.schemas.ts — keep both in sync
// (see plan.md §0.1 "Type sharing without a monorepo").
import { z } from "zod"

export const MAIL_FOLDERS = [
  "inbox",
  "sent",
  "archive",
  "trash",
  "snoozed",
  "outbox",
] as const
export type MailFolder = (typeof MAIL_FOLDERS)[number]

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const createMailAccountSchema = z.object({
  email: z.email().max(254),
  displayName: z.string().max(120).optional(),
  imapHost: z.string().min(1).max(255),
  imapPort: z.number().int().min(1).max(65535).default(993),
  imapSecure: z.boolean().default(true),
  smtpHost: z.string().min(1).max(255),
  smtpPort: z.number().int().min(1).max(65535).default(465),
  smtpSecure: z.boolean().default(true),
  username: z.string().min(1).max(254),
  password: z.string().min(1).max(1024),
})

export const patchThreadSchema = z
  .object({
    isUnread: z.boolean().optional(),
    isFlagged: z.boolean().optional(),
    folder: z.enum(["inbox", "archive", "trash"]).optional(),
  })
  .refine(
    (v) => v.isUnread !== undefined || v.isFlagged !== undefined || v.folder !== undefined,
    { message: "At least one field is required" },
  )

export const snoozeThreadSchema = z.object({
  until: z.iso.datetime(),
})

export const sendAttachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  /** Base64-encoded content, total payload capped server-side (~10 MB). */
  contentBase64: z.string().min(1),
})

export const sendMailSchema = z.object({
  accountId: z.uuid(),
  to: z.array(z.email()).min(1).max(100),
  cc: z.array(z.email()).max(100).default([]),
  bcc: z.array(z.email()).max(100).default([]),
  subject: z.string().max(998).default(""),
  bodyText: z.string().max(500_000).default(""),
  /** Thread to append the outbound message to (reply/reply-all/forward). */
  threadId: z.uuid().optional(),
  /** RFC Message-ID being replied to, for correct threading headers. */
  inReplyTo: z.string().max(998).optional(),
  attachments: z.array(sendAttachmentSchema).max(20).default([]),
  /** ISO datetime — when set, the message is queued in the outbox. */
  scheduledAt: z.iso.datetime().optional(),
})

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const mailAccountSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string().nullable(),
  provider: z.string(),
  createdAt: z.string(),
})

export const attachmentMetaSchema = z.object({
  filename: z.string(),
  contentType: z.string(),
  size: z.number(),
})

export const mailThreadSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  subject: z.string(),
  snippet: z.string(),
  fromAddr: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
  isUnread: z.boolean(),
  isFlagged: z.boolean(),
  folder: z.string(),
  snoozedUntil: z.string().nullable(),
  messageCount: z.number(),
  hasAttachments: z.boolean().optional(),
})

export const emailMessageSchema = z.object({
  id: z.uuid(),
  threadId: z.uuid(),
  fromAddr: z.string(),
  to: z.array(z.string()),
  cc: z.array(z.string()),
  subject: z.string().optional(),
  bodyHtml: z.string().nullable(),
  bodyText: z.string().nullable(),
  attachments: z.array(attachmentMetaSchema),
  folder: z.string(),
  messageId: z.string().nullable(),
  isOutbound: z.boolean(),
  scheduledAt: z.string().nullable(),
  sentAt: z.string().nullable(),
})

export const threadListResponseSchema = z.object({
  threads: z.array(mailThreadSchema),
  nextCursor: z.string().nullable(),
})

export const threadDetailResponseSchema = z.object({
  thread: mailThreadSchema,
  emails: z.array(emailMessageSchema),
})

export const unreadCountResponseSchema = z.object({
  count: z.number(),
})

export type CreateMailAccountInput = z.infer<typeof createMailAccountSchema>
export type PatchThreadInput = z.infer<typeof patchThreadSchema>
export type SnoozeThreadInput = z.infer<typeof snoozeThreadSchema>
export type SendMailInput = z.infer<typeof sendMailSchema>
export type SendAttachment = z.infer<typeof sendAttachmentSchema>
export type MailAccount = z.infer<typeof mailAccountSchema>
export type AttachmentMeta = z.infer<typeof attachmentMetaSchema>
export type MailThread = z.infer<typeof mailThreadSchema>
export type EmailMessage = z.infer<typeof emailMessageSchema>
export type ThreadListResponse = z.infer<typeof threadListResponseSchema>
export type ThreadDetailResponse = z.infer<typeof threadDetailResponseSchema>
