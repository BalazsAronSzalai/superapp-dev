import "dotenv/config"
import express from "express"
import cors from "cors"
import { authRouter } from "./routes/auth.routes.js"
import { mailRouter } from "./routes/mail.routes.js"
import { errorHandler, notFoundHandler } from "./middleware/errors.js"

const app = express()

app.use(cors())
// 16 MB: send payloads may carry base64 attachments (~10 MB decoded cap).
app.use(express.json({ limit: "16mb" }))

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() })
})

app.use("/api/auth", authRouter)
app.use("/api/mail", mailRouter)

// Module routers land here in later phases:
// app.use("/api/tasks", tasksRouter)    — Phase 3
// app.use("/api/calendar", calRouter)   — Phase 4
// app.use("/api/notes", notesRouter)    — Phase 5
// app.use("/api/finance", finRouter)    — Phase 6

app.use(notFoundHandler)
app.use(errorHandler)

// On Vercel the app is exported from api/index.ts and must not bind a port.
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? 3001)
  app.listen(port, () => {
    console.log(`superapp backend listening on :${port}`)
  })
}

export default app
