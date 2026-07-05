import { describe, expect, it } from "vitest";
import { matches } from "@/lib/categorization/rules";
import type { CategorizationRule, Transaction } from "@/lib/db/schema";

function rule(overrides: Partial<CategorizationRule> = {}): CategorizationRule {
  return {
    id: "rule-1",
    tenantId: "00000000-0000-0000-0000-0000000000aa",
    userId: "user-1",
    matchKind: "description_contains",
    matchValue: "",
    categoryId: "cat-1",
    priority: 1,
    source: "user",
    matchCount: 0,
    lastMatchedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function txn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "txn-1",
    tenantId: "00000000-0000-0000-0000-0000000000aa",
    accountId: "acct-1",
    importBatchId: "00000000-0000-0000-0000-000000000001",
    externalId: "abc123",
    startedAt: new Date("2026-01-15T10:00:00Z"),
    completedAt: new Date("2026-01-15T10:01:00Z"),
    amountNative: -999,
    feeNative: 0,
    currency: "EUR",
    state: "completed",
    descriptionRaw: "Spotify Premium",
    typeRaw: "CARD_PAYMENT",
    productRaw: "Current",
    runningBalanceNative: null,
    categoryId: null,
    categorizedBy: null,
    categorizationRuleId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("matches — description_contains", () => {
  it("matches when description contains the value (case-insensitive)", () => {
    expect(matches(rule({ matchKind: "description_contains", matchValue: "spotify" }), txn())).toBe(
      true,
    );
  });

  it("matches regardless of case in description", () => {
    expect(matches(rule({ matchKind: "description_contains", matchValue: "SPOTIFY" }), txn())).toBe(
      true,
    );
  });

  it("does not match when description does not contain the value", () => {
    expect(matches(rule({ matchKind: "description_contains", matchValue: "netflix" }), txn())).toBe(
      false,
    );
  });

  it("matches on empty matchValue (every description contains empty string)", () => {
    expect(matches(rule({ matchKind: "description_contains", matchValue: "" }), txn())).toBe(true);
  });

  it("treats null descriptionRaw as empty string", () => {
    expect(
      matches(
        rule({ matchKind: "description_contains", matchValue: "anything" }),
        txn({ descriptionRaw: null }),
      ),
    ).toBe(false);
  });
});

describe("matches — description_regex", () => {
  it("matches a regex pattern (case-insensitive)", () => {
    expect(matches(rule({ matchKind: "description_regex", matchValue: "^spotify" }), txn())).toBe(
      true,
    );
  });

  it("does not match when regex does not match", () => {
    expect(matches(rule({ matchKind: "description_regex", matchValue: "^netflix" }), txn())).toBe(
      false,
    );
  });

  it("returns false for an invalid regex (does not throw)", () => {
    expect(matches(rule({ matchKind: "description_regex", matchValue: "[invalid" }), txn())).toBe(
      false,
    );
  });
});

describe("matches — type_raw_equals", () => {
  it("matches when typeRaw equals the value (case-insensitive)", () => {
    expect(matches(rule({ matchKind: "type_raw_equals", matchValue: "card_payment" }), txn())).toBe(
      true,
    );
  });

  it("matches regardless of case", () => {
    expect(matches(rule({ matchKind: "type_raw_equals", matchValue: "CARD_PAYMENT" }), txn())).toBe(
      true,
    );
  });

  it("does not match a different type", () => {
    expect(matches(rule({ matchKind: "type_raw_equals", matchValue: "transfer" }), txn())).toBe(
      false,
    );
  });
});

describe("matches — amount_range", () => {
  it("matches when amount is within min and max", () => {
    const r = rule({
      matchKind: "amount_range",
      matchValue: JSON.stringify({ min: -2000, max: -500 }),
    });
    expect(matches(r, txn({ amountNative: -999 }))).toBe(true);
  });

  it("does not match when amount is below min", () => {
    const r = rule({ matchKind: "amount_range", matchValue: JSON.stringify({ min: -500 }) });
    expect(matches(r, txn({ amountNative: -999 }))).toBe(false);
  });

  it("does not match when amount exceeds max", () => {
    const r = rule({ matchKind: "amount_range", matchValue: JSON.stringify({ max: -2000 }) });
    expect(matches(r, txn({ amountNative: -999 }))).toBe(false);
  });

  it("matches with only min specified", () => {
    const r = rule({ matchKind: "amount_range", matchValue: JSON.stringify({ min: -1500 }) });
    expect(matches(r, txn({ amountNative: -999 }))).toBe(true);
  });

  it("matches with only max specified", () => {
    const r = rule({ matchKind: "amount_range", matchValue: JSON.stringify({ max: 0 }) });
    expect(matches(r, txn({ amountNative: -999 }))).toBe(true);
  });

  it("matches with no min/max (any amount)", () => {
    const r = rule({ matchKind: "amount_range", matchValue: JSON.stringify({}) });
    expect(matches(r, txn({ amountNative: 99999 }))).toBe(true);
  });

  it("returns false for invalid JSON matchValue (does not throw)", () => {
    const r = rule({ matchKind: "amount_range", matchValue: "not-json" });
    expect(matches(r, txn())).toBe(false);
  });
});

describe("matches — account_id_equals", () => {
  it("matches when accountId equals matchValue", () => {
    const r = rule({ matchKind: "account_id_equals", matchValue: "acct-1" });
    expect(matches(r, txn({ accountId: "acct-1" }))).toBe(true);
  });

  it("does not match a different accountId", () => {
    const r = rule({ matchKind: "account_id_equals", matchValue: "acct-99" });
    expect(matches(r, txn({ accountId: "acct-1" }))).toBe(false);
  });
});
