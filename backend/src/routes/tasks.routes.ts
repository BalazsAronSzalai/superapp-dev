import { Router } from "express"
import { validateBody } from "../middleware/validate.js"
import { requireAuth } from "../middleware/auth.js"
import {
  createTaskListSchema,
  patchTaskListSchema,
  createTaskSchema,
  patchTaskSchema,
} from "../shared/task.schemas.js"
import {
  listTaskLists,
  createTaskList,
  patchTaskList,
  deleteTaskList,
  listTasks,
  taskCounts,
  createTask,
  getTask,
  patchTask,
  deleteTask,
  completeTask,
  uncompleteTask,
} from "../controllers/tasks.controller.js"

export const tasksRouter = Router()

tasksRouter.use(requireAuth)

// Lists (static segments before /:id).
tasksRouter.get("/lists", listTaskLists)
tasksRouter.post("/lists", validateBody(createTaskListSchema), createTaskList)
tasksRouter.patch("/lists/:id", validateBody(patchTaskListSchema), patchTaskList)
tasksRouter.delete("/lists/:id", deleteTaskList)

tasksRouter.get("/counts", taskCounts)

// Tasks.
tasksRouter.get("/", listTasks)
tasksRouter.post("/", validateBody(createTaskSchema), createTask)
tasksRouter.get("/:id", getTask)
tasksRouter.patch("/:id", validateBody(patchTaskSchema), patchTask)
tasksRouter.delete("/:id", deleteTask)
tasksRouter.post("/:id/complete", completeTask)
tasksRouter.post("/:id/uncomplete", uncompleteTask)
