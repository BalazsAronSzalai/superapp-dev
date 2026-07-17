import { describe, it, expect } from "@jest/globals"
import { categorizeTransaction } from "../src/services/categorize.js"

describe("categorizeTransaction", () => {
  it.each([
    ["Lidl Budapest", null, "debit", "groceries"],
    ["Netflix.com", null, "debit", "subscriptions"],
    ["Telekom Magyarorszag", null, "debit", "utilities"],
    ["Wolt", "Lunch order", "debit", "dining"],
    ["BKK automata", null, "debit", "transport"],
    ["BENU Gyógyszertár", null, "debit", "health"],
    ["Cinema City Arena", null, "debit", "entertainment"],
  ] as const)("categorizes %s as %s", (merchant, description, type, expected) => {
    expect(categorizeTransaction(merchant, description, type)).toBe(expected)
  })

  it("matches on description when merchant is empty", () => {
    expect(categorizeTransaction(null, "Spotify subscription", "debit")).toBe("subscriptions")
  })

  it("is case-insensitive", () => {
    expect(categorizeTransaction("LIDL ARAD UTCA", null, "debit")).toBe("groceries")
  })

  it("first matching rule wins (subscriptions before shopping)", () => {
    expect(categorizeTransaction("Amazon Prime", null, "debit")).toBe("subscriptions")
  })

  it("falls back to income for uncategorized credits", () => {
    expect(categorizeTransaction("Xyzzy Kft", null, "credit")).toBe("income")
  })

  it("falls back to other for uncategorized debits", () => {
    expect(categorizeTransaction("Xyzzy Kft", null, "debit")).toBe("other")
  })

  it("handles null merchant and description", () => {
    expect(categorizeTransaction(null, null, "debit")).toBe("other")
    expect(categorizeTransaction(undefined, undefined, "credit")).toBe("income")
  })
})
