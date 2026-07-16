import { Router } from "express"
import type { Request, Response, NextFunction } from "express"
import { validateBody } from "../middleware/validate.js"
import { requireAuth } from "../middleware/auth.js"
import { verifyAccessToken } from "../services/jwt.js"
import {
  createMailAccountSchema,
  patchThreadSchema,
  snoozeThreadSchema,
  sendMailSchema,
} from "../shared/mail.schemas.js"
import {
  createAccount,
  listAccounts,
  deleteAccount,
  syncAccountHandler,
  listThreads,
  getThread,
  patchThread,
  deleteThread,
  snoozeThread,
  unsnoozeThread,
  unreadCount,
  send,
  processScheduled,
  search,
  downloadAttachment,
} from "../controllers/mail.controller.js"

export const mailRouter = Router()

/**
 * process-scheduled accepts either a user bearer token (scoped to that
 * user's outbox) or the CRON_SECRET (processes everything) — used by the
 * Vercel cron in backend/vercel.json.
 */
async function cronOrUserAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && header === `Bearer ${cronSecret}`) {
    next()
    return
  }
  if (header?.startsWith("Bearer ")) {
    const userId = await verifyAccessToken(header.slice("Bearer ".length))
    if (userId) {
      req.userId = userId
      next()
      return
    }
  }
  res.status(401).json({ error: "Unauthorized" })
}

// Cron endpoint (GET for Vercel cron, POST for opportunistic client calls).
mailRouter.get("/process-scheduled", cronOrUserAuth, processScheduled)
mailRouter.post("/process-scheduled", cronOrUserAuth, processScheduled)

// Everything else requires a signed-in user.
mailRouter.use(requireAuth)

mailRouter.post("/accounts", validateBody(createMailAccountSchema), createAccount)
mailRouter.get("/accounts", listAccounts)
mailRouter.delete("/accounts/:id", deleteAccount)
mailRouter.post("/accounts/:id/sync", syncAccountHandler)

mailRouter.get("/threads", listThreads)
mailRouter.get("/threads/unread-count", unreadCount)
mailRouter.get("/threads/:id", getThread)
mailRouter.patch("/threads/:id", validateBody(patchThreadSchema), patchThread)
mailRouter.delete("/threads/:id", deleteThread)
mailRouter.post("/threads/:id/snooze", validateBody(snoozeThreadSchema), snoozeThread)
mailRouter.post("/threads/:id/unsnooze", unsnoozeThread)

mailRouter.post("/send", validateBody(sendMailSchema), send)
mailRouter.get("/search", search)
mailRouter.get("/emails/:id/attachments/:index", downloadAttachment)
