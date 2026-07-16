/**
 * Vercel serverless entrypoint (plan.md Phase 1: "backend on Vercel").
 * All routes are rewritten here via vercel.json; the Express app handles routing.
 */
import app from "../src/index.js"

export default app
