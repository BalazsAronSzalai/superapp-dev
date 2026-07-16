import { eq } from "drizzle-orm"
import { db, schema } from "../db/index.js"

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

interface PushMessage {
  title: string
  body: string
  data?: Record<string, unknown>
}

/**
 * Send a push notification to all of a user's registered devices
 * via the Expo Push service. Wired early per Phase 1; modules
 * (mail, tasks, calendar) call this from Phase 2 onward.
 */
export async function sendPushToUser(userId: string, message: PushMessage) {
  const tokens = await db
    .select({ token: schema.pushTokens.token })
    .from(schema.pushTokens)
    .where(eq(schema.pushTokens.userId, userId))

  if (tokens.length === 0) return

  const payload = tokens.map(({ token }) => ({
    to: token,
    sound: "default",
    title: message.title,
    body: message.body,
    data: message.data ?? {},
  }))

  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    console.error("[backend] Expo push failed:", res.status, await res.text())
  }
}
