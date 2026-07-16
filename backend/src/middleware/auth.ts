import type { Request, Response, NextFunction } from "express"
import { verifyAccessToken } from "../services/jwt.js"

declare global {
  namespace Express {
    interface Request {
      userId?: string
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token" })
    return
  }
  const userId = await verifyAccessToken(header.slice("Bearer ".length))
  if (!userId) {
    res.status(401).json({ error: "Invalid or expired token" })
    return
  }
  req.userId = userId
  next()
}
