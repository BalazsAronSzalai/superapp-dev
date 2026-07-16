// Typed API calls for the Mail module (backend: /api/mail/*).
import { api, API_URL } from "./api"
import { getAccessToken } from "./token-store"
import type {
  CreateMailAccountInput,
  PatchThreadInput,
  SendMailInput,
  MailAccount,
  MailThread,
  ThreadListResponse,
  ThreadDetailResponse,
} from "./schemas/mail.schemas"

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function createMailAccount(input: CreateMailAccountInput) {
  return api<{ account: MailAccount }>("/api/mail/accounts", {
    method: "POST",
    body: input,
  })
}

export async function listMailAccounts() {
  return api<{ accounts: MailAccount[] }>("/api/mail/accounts")
}

export async function deleteMailAccount(id: string) {
  return api<void>(`/api/mail/accounts/${id}`, { method: "DELETE" })
}

export interface SyncResult {
  newMessages: number
  scheduledSent: number
}

export async function syncMailAccount(id: string) {
  return api<SyncResult>(`/api/mail/accounts/${id}/sync`, { method: "POST" })
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

export async function listThreads(folder: string, cursor?: string) {
  const params = new URLSearchParams({ folder })
  if (cursor) params.set("cursor", cursor)
  return api<ThreadListResponse>(`/api/mail/threads?${params.toString()}`)
}

export async function getThread(id: string) {
  return api<ThreadDetailResponse>(`/api/mail/threads/${id}`)
}

export async function patchThread(id: string, input: PatchThreadInput) {
  return api<{ thread: MailThread }>(`/api/mail/threads/${id}`, {
    method: "PATCH",
    body: input,
  })
}

export async function deleteThread(id: string) {
  return api<void>(`/api/mail/threads/${id}`, { method: "DELETE" })
}

export async function snoozeThread(id: string, until: string) {
  return api<void>(`/api/mail/threads/${id}/snooze`, {
    method: "POST",
    body: { until },
  })
}

export async function unsnoozeThread(id: string) {
  return api<void>(`/api/mail/threads/${id}/unsnooze`, { method: "POST" })
}

export async function getUnreadCount() {
  return api<{ count: number }>("/api/mail/threads/unread-count")
}

// ---------------------------------------------------------------------------
// Send + search + attachments
// ---------------------------------------------------------------------------

export async function sendMail(input: SendMailInput) {
  return api<{ id: string; status: "sent" | "scheduled" }>("/api/mail/send", {
    method: "POST",
    body: input,
  })
}

export async function searchMail(q: string) {
  const params = new URLSearchParams({ q })
  return api<ThreadListResponse>(`/api/mail/search?${params.toString()}`)
}

/**
 * Attachment download URL + auth header for expo-file-system's
 * downloadAsync (the shared fetch wrapper can't stream binary bodies).
 */
export async function attachmentDownloadRequest(emailId: string, index: number) {
  const token = await getAccessToken()
  return {
    url: `${API_URL}/api/mail/emails/${emailId}/attachments/${index}`,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }
}
