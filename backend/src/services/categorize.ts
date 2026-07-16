/**
 * Rule-based transaction categorization engine (plan.md Phase 6).
 *
 * Matches merchant + description text against ordered keyword rules tuned for
 * the Hungarian market (OTP/Revolut-style PFM): local grocery/utility/telco
 * brands plus the usual international subscriptions. First rule that matches
 * wins, so more specific rules (subscriptions, utilities) sit above broad
 * ones (shopping). Dependency-free on purpose — an ML classifier can replace
 * this behind the same function signature later.
 */
import type { TransactionCategory, TransactionType } from "../shared/finance.schemas.js"

interface CategoryRule {
  category: TransactionCategory
  keywords: string[]
}

/** Ordered: first match wins. Keywords are matched on lowercased text. */
const RULES: CategoryRule[] = [
  {
    category: "subscriptions",
    keywords: [
      "netflix", "spotify", "hbo", "disney+", "youtube premium", "apple.com/bill",
      "apple music", "icloud", "google one", "amazon prime", "playstation plus",
      "xbox game pass", "patreon", "előfizetés", "subscription",
    ],
  },
  {
    category: "utilities",
    keywords: [
      "telekom", "vodafone", "yettel", "digi", "e.on", "eon ", "mvm", "főgáz",
      "elmű", "díjbeszedő", "vízművek", "fővárosi csatornázási", "internet",
      "közüzem", "utility", "electricity", "áramdíj", "gázdíj",
    ],
  },
  {
    category: "groceries",
    keywords: [
      "lidl", "aldi", "tesco", "spar", "interspar", "penny", "cba", "coop",
      "auchan", "prima", "grocery", "élelmiszer", "abc ",
    ],
  },
  {
    category: "dining",
    keywords: [
      "wolt", "foodora", "foodpanda", "mcdonald", "burger king", "kfc", "subway",
      "starbucks", "costa coffee", "étterem", "restaurant", "bistro", "pizzéria",
      "pizza", "kávézó", "cafe", "café", "büfé", "bar ",
    ],
  },
  {
    category: "transport",
    keywords: [
      "bkk", "máv", "volán", "mol ", "omv", "shell", "bolt", "uber", "lime",
      "főtaxi", "city taxi", "taxi", "parkolás", "parking", "üzemanyag", "fuel",
      "benzinkút", "vignette", "matrica",
    ],
  },
  {
    category: "health",
    keywords: [
      "gyógyszertár", "benu", "pharmacy", "patika", "orvos", "dental", "fogász",
      "klinika", "clinic", "hospital", "kórház", "optika", "szemüveg",
    ],
  },
  {
    category: "entertainment",
    keywords: [
      "cinema", "mozi", "cinema city", "steam", "playstation store", "nintendo",
      "epic games", "koncert", "concert", "ticket", "jegy.hu", "színház",
      "theatre", "múzeum", "museum",
    ],
  },
  {
    category: "travel",
    keywords: [
      "wizz air", "wizzair", "ryanair", "lufthansa", "booking.com", "airbnb",
      "hotel", "hostel", "szállás", "flixbus", "reptér", "airport",
    ],
  },
  {
    category: "housing",
    keywords: [
      "lakbér", "albérlet", "rent ", "közös költség", "társasház", "mortgage",
      "hitel törlesztés", "lakáshitel", "biztosító", "insurance",
    ],
  },
  {
    category: "shopping",
    keywords: [
      "amazon", "emag", "alza", "media markt", "mediamarkt", "ikea", "decathlon",
      "dm ", "rossmann", "müller", "zara", "h&m", "reserved", "sinsay", "pepco",
      "kik ", "obi", "praktiker", "temu", "aliexpress",
    ],
  },
  {
    category: "cash",
    keywords: ["atm", "készpénzfelvét", "cash withdrawal", "készpénz"],
  },
  {
    category: "fees",
    keywords: [
      "bank fee", "bankköltség", "számlavezetési díj", "tranzakciós díj",
      "kártyadíj", "service fee", "kamat", "interest charge",
    ],
  },
  {
    category: "transfer",
    keywords: ["átutalás", "transfer", "revolut top-up", "wise", "utalás"],
  },
  {
    category: "income",
    keywords: [
      "salary", "fizetés", "munkabér", "bér jóváírás", "payroll", "osztalék",
      "dividend", "refund", "visszatérítés", "cashback",
    ],
  },
]

/**
 * Categorize a transaction from its merchant/description text.
 * Uncategorizable credits default to "income", debits to "other".
 */
export function categorizeTransaction(
  merchant: string | null | undefined,
  description: string | null | undefined,
  type: TransactionType,
): TransactionCategory {
  const text = `${merchant ?? ""} ${description ?? ""}`.toLowerCase().trim()
  if (text.length > 0) {
    for (const rule of RULES) {
      if (rule.keywords.some((k) => text.includes(k))) return rule.category
    }
  }
  return type === "credit" ? "income" : "other"
}
