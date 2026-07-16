// Cross-module entity metadata: where each linkable entity lives in the app
// and how it is presented (icon + label). Used by universal search results
// and the cross-module linking UI (Phase 7 superapp glue).
import type { LucideIcon } from "lucide-react-native"
import {
  CalendarDays,
  Mail,
  NotebookPen,
  PiggyBank,
  Receipt,
  SquareCheckBig,
} from "lucide-react-native"

import type { EntityLinkType, SearchType } from "@/lib/schemas/glue.schemas"

/** Route for an entity's detail screen, or null when it has no screen. */
export function entityRoute(type: EntityLinkType, id: string): string | null {
  switch (type) {
    case "thread":
      return `/mail/thread/${id}`
    case "email":
      // Emails are shown inside their thread; the API resolves titles per
      // thread so deep-linking to the thread is the right destination.
      return null
    case "task":
      return `/todo/task/${id}`
    case "event":
      return `/calendar/event/${id}`
    case "note":
      return `/notes/note/${id}`
    case "transaction":
      return `/finance/transaction/${id}`
    case "budget":
      return "/finance/budgets"
  }
}

export const ENTITY_META: Record<EntityLinkType, { label: string; icon: LucideIcon }> = {
  thread: { label: "Mail", icon: Mail },
  email: { label: "Mail", icon: Mail },
  task: { label: "Task", icon: SquareCheckBig },
  event: { label: "Event", icon: CalendarDays },
  note: { label: "Note", icon: NotebookPen },
  transaction: { label: "Transaction", icon: Receipt },
  budget: { label: "Budget", icon: PiggyBank },
}

export const SEARCH_TYPE_META: Record<SearchType, { label: string; icon: LucideIcon }> = {
  mail: { label: "Mail", icon: Mail },
  tasks: { label: "Tasks", icon: SquareCheckBig },
  events: { label: "Events", icon: CalendarDays },
  notes: { label: "Notes", icon: NotebookPen },
  transactions: { label: "Transactions", icon: Receipt },
}
