import { Router } from "express"
import { validateBody } from "../middleware/validate.js"
import { requireAuth } from "../middleware/auth.js"
import { createLinkSchema, emailToTaskSchema } from "../shared/glue.schemas.js"
import {
  search,
  createLink,
  listLinks,
  deleteLink,
  emailToTask,
  getToday,
} from "../controllers/glue.controller.js"

/** GET /api/search */
export const searchRouter = Router()
searchRouter.use(requireAuth)
searchRouter.get("/", search)

/** /api/links */
export const linksRouter = Router()
linksRouter.use(requireAuth)
linksRouter.post("/", validateBody(createLinkSchema), createLink)
linksRouter.get("/", listLinks)
linksRouter.post("/email-to-task", validateBody(emailToTaskSchema), emailToTask)
linksRouter.delete("/:id", deleteLink)

/** GET /api/today */
export const todayRouter = Router()
todayRouter.use(requireAuth)
todayRouter.get("/", getToday)
