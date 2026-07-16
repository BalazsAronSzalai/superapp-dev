// Icon + label + color metadata for the rule-based transaction taxonomy
// (mirrors backend/src/services/categorize.ts categories).
import {
  Banknote,
  Bus,
  Clapperboard,
  CircleDollarSign,
  HeartPulse,
  House,
  Landmark,
  Plane,
  Plug,
  Repeat,
  ShoppingBag,
  ShoppingCart,
  Tag,
  ArrowLeftRight,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react-native"

import type { TransactionCategory } from "@/lib/schemas/finance.schemas"

export interface CategoryMeta {
  label: string
  icon: LucideIcon
  /** Fixed hex per category (iOS system palette) — same in light/dark. */
  color: string
}

export const CATEGORY_META: Record<TransactionCategory, CategoryMeta> = {
  groceries: { label: "Groceries", icon: ShoppingCart, color: "#34C759" },
  dining: { label: "Dining", icon: UtensilsCrossed, color: "#FF9500" },
  transport: { label: "Transport", icon: Bus, color: "#007AFF" },
  shopping: { label: "Shopping", icon: ShoppingBag, color: "#FF2D55" },
  entertainment: { label: "Entertainment", icon: Clapperboard, color: "#AF52DE" },
  subscriptions: { label: "Subscriptions", icon: Repeat, color: "#5856D6" },
  utilities: { label: "Utilities", icon: Plug, color: "#FFCC00" },
  housing: { label: "Housing", icon: House, color: "#A2845E" },
  health: { label: "Health", icon: HeartPulse, color: "#FF3B30" },
  travel: { label: "Travel", icon: Plane, color: "#32ADE6" },
  cash: { label: "Cash", icon: Banknote, color: "#30D158" },
  fees: { label: "Fees", icon: Landmark, color: "#8E8E93" },
  transfer: { label: "Transfer", icon: ArrowLeftRight, color: "#64D2FF" },
  income: { label: "Income", icon: CircleDollarSign, color: "#34C759" },
  other: { label: "Other", icon: Tag, color: "#8E8E93" },
}

/** Fallback meta for uncategorized transactions. */
export const UNCATEGORIZED_META: CategoryMeta = {
  label: "Uncategorized",
  icon: Tag,
  color: "#8E8E93",
}

export function categoryMeta(category: TransactionCategory | null): CategoryMeta {
  return category ? CATEGORY_META[category] : UNCATEGORIZED_META
}

/** Hex + alpha suffix helper for soft chip/icon backgrounds. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")
  return `${hex}${a}`
}
