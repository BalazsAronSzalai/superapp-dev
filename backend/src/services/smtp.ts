import nodemailer from "nodemailer"
import type { MailAccountConfig } from "./imap.js"
import type { SendAttachment } from "../shared/mail.schemas.js"

function createTransport(config: MailAccountConfig) {
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.username, pass: config.password },
    connectionTimeout: 15_000,
    socketTimeout: 30_000,
  })
}

/** Throws when SMTP credentials are invalid. */
export async function verifySmtpCredentials(config: MailAccountConfig): Promise<void> {
  const transport = createTransport(config)
  try {
    await transport.verify()
  } finally {
    transport.close()
  }
}

export interface OutgoingMail {
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  bodyText: string
  inReplyTo?: string
  attachments: SendAttachment[]
}

export interface SentInfo {
  messageId: string | null
}

export async function sendMail(
  config: MailAccountConfig,
  mail: OutgoingMail,
): Promise<SentInfo> {
  const transport = createTransport(config)
  try {
    const info = await transport.sendMail({
      from: config.displayName
        ? { name: config.displayName, address: config.email }
        : config.email,
      to: mail.to,
      cc: mail.cc.length > 0 ? mail.cc : undefined,
      bcc: mail.bcc.length > 0 ? mail.bcc : undefined,
      subject: mail.subject,
      text: mail.bodyText,
      inReplyTo: mail.inReplyTo,
      references: mail.inReplyTo,
      attachments: mail.attachments.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        content: Buffer.from(a.contentBase64, "base64"),
      })),
    })
    return { messageId: info.messageId ?? null }
  } finally {
    transport.close()
  }
}
