import { Router } from "express"
import { validateBody } from "../middleware/validate.js"
import { requireAuth } from "../middleware/auth.js"
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  pushTokenSchema,
} from "../shared/auth.schemas.js"
import {
  register,
  login,
  refresh,
  logout,
  me,
  registerPushToken,
} from "../controllers/auth.controller.js"

export const authRouter = Router()

authRouter.post("/register", validateBody(registerSchema), register)
authRouter.post("/login", validateBody(loginSchema), login)
authRouter.post("/refresh", validateBody(refreshSchema), refresh)
authRouter.post("/logout", validateBody(refreshSchema), logout)
authRouter.get("/me", requireAuth, me)
authRouter.post("/push-token", requireAuth, validateBody(pushTokenSchema), registerPushToken)
