import { Router } from "express"
import { validateBody } from "../middleware/validate.js"
import { requireAuth } from "../middleware/auth.js"
import { authRateLimit } from "../middleware/rate-limit.js"
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  pushTokenSchema,
  twoFaCodeSchema,
  twoFaVerifySchema,
} from "../shared/auth.schemas.js"
import {
  register,
  login,
  refresh,
  logout,
  me,
  registerPushToken,
  twofaVerify,
  twofaSetup,
  twofaEnable,
  twofaDisable,
} from "../controllers/auth.controller.js"

export const authRouter = Router()

// Credential endpoints get the strict limiter (brute-force protection).
authRouter.post("/register", authRateLimit, validateBody(registerSchema), register)
authRouter.post("/login", authRateLimit, validateBody(loginSchema), login)
authRouter.post("/refresh", authRateLimit, validateBody(refreshSchema), refresh)
authRouter.post("/logout", validateBody(refreshSchema), logout)
authRouter.get("/me", requireAuth, me)
authRouter.post("/push-token", requireAuth, validateBody(pushTokenSchema), registerPushToken)

// TOTP two-factor auth.
authRouter.post("/2fa/verify", authRateLimit, validateBody(twoFaVerifySchema), twofaVerify)
authRouter.post("/2fa/setup", requireAuth, twofaSetup)
authRouter.post("/2fa/enable", authRateLimit, requireAuth, validateBody(twoFaCodeSchema), twofaEnable)
authRouter.post("/2fa/disable", authRateLimit, requireAuth, validateBody(twoFaCodeSchema), twofaDisable)
