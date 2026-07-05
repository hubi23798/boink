import { describe, expect, it, vi } from "vitest";
import { applyTransferHeuristic } from "@/lib/categorization/transfer-heuristic";
import type { Transaction } from "@/lib/db/schema";

function makeTxn(overrides: Partial<Transaction>): Transaction {
  return {
    id: "txn-1",
    tenantId: "00000000-0000-0000-0000-0000000000aa",
    accountId: "acct-1",
    importBatchId: "00000000-0000-0000-0000-000000000001",
    externalId: "abc123",
    startedAt: new Date("2026-01-15T10:00:00Z"),
    completedAt: null,
    amountNative: 0,
    feeNative: 0,
    currency: "EUR",
    state: "completed",
    descriptionRaw: "",
    typeRaw: "Transfer",
    productRaw: "Current",
    runningBalanceNative: null,
    categoryId: null,
    categorizedBy: null,
    categorizationRuleId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeDb(txns: Transaction[]) {
  const updatedIds: string[] = [];

  const db = {
    query: {
      transaction: {
        findMany: vi.fn().mockResolvedValue(txns),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockImplementation((_cond) => {
          txns
            .filter((t) => t.categoryId === null)
            .forEach((t) => {
              updatedIds.push(t.id);
            });
          return Promise.resolve();
        }),
      })),
    })),
    _updatedIds: updatedIds,
  };

  return db as unknown as Parameters<typeof applyTransferHeuristic>[0] & { _updatedIds: string[] };
}

describe("applyTransferHeuristic", () => {
  it("returns 0 when transactionIds is empty", async () => {
    const db = makeDb([]);
    const result = await applyTransferHeuristic(db, []);
    expect(result).toBe(0);
  });

  it("pairs two transfers from different accounts with cancelling amounts in the same minute", async () => {
    const t = new Date("2026-01-15T10:00:30Z");
    const txns = [
      makeTxn({ id: "a", accountId: "acct-1", amountNative: 10000, startedAt: t }),
      makeTxn({ id: "b", accountId: "acct-2", amountNative: -10000, startedAt: t }),
    ];
    const db = makeDb(txns);
    const result = await applyTransferHeuristic(db, ["a", "b"]);
    expect(result).toBe(2);
  });

  it("does not pair transfers from the same account", async () => {
    const t = new Date("2026-01-15T10:00:30Z");
    const txns = [
      makeTxn({ id: "a", accountId: "acct-1", amountNative: 10000, startedAt: t }),
      makeTxn({ id: "b", accountId: "acct-1", amountNative: -10000, startedAt: t }),
    ];
    const db = makeDb(txns);
    const result = await applyTransferHeuristic(db, ["a", "b"]);
    expect(result).toBe(0);
  });

  it("does not pair transfers in different minute buckets", async () => {
    const txns = [
      makeTxn({
        id: "a",
        accountId: "acct-1",
        amountNative: 10000,
        startedAt: new Date("2026-01-15T10:00:00Z"),
      }),
      makeTxn({
        id: "b",
        accountId: "acct-2",
        amountNative: -10000,
        startedAt: new Date("2026-01-15T10:01:00Z"),
      }),
    ];
    const db = makeDb(txns);
    const result = await applyTransferHeuristic(db, ["a", "b"]);
    expect(result).toBe(0);
  });

  it("does not pair when amounts do not cancel", async () => {
    const t = new Date("2026-01-15T10:00:30Z");
    const txns = [
      makeTxn({ id: "a", accountId: "acct-1", amountNative: 10000, startedAt: t }),
      makeTxn({ id: "b", accountId: "acct-2", amountNative: -9999, startedAt: t }),
    ];
    const db = makeDb(txns);
    const result = await applyTransferHeuristic(db, ["a", "b"]);
    expect(result).toBe(0);
  });

  it("only considers typeRaw=Transfer (case-insensitive)", async () => {
    const t = new Date("2026-01-15T10:00:30Z");
    const txns = [
      makeTxn({
        id: "a",
        accountId: "acct-1",
        amountNative: 10000,
        startedAt: t,
        typeRaw: "CARD_PAYMENT",
      }),
      makeTxn({
        id: "b",
        accountId: "acct-2",
        amountNative: -10000,
        startedAt: t,
        typeRaw: "CARD_PAYMENT",
      }),
    ];
    const db = makeDb(txns);
    const result = await applyTransferHeuristic(db, ["a", "b"]);
    expect(result).toBe(0);
  });

  it("treats 'TRANSFER' (upper-case) as a transfer type", async () => {
    const t = new Date("2026-01-15T10:00:30Z");
    const txns = [
      makeTxn({
        id: "a",
        accountId: "acct-1",
        amountNative: 5000,
        startedAt: t,
        typeRaw: "TRANSFER",
      }),
      makeTxn({
        id: "b",
        accountId: "acct-2",
        amountNative: -5000,
        startedAt: t,
        typeRaw: "TRANSFER",
      }),
    ];
    const db = makeDb(txns);
    const result = await applyTransferHeuristic(db, ["a", "b"]);
    expect(result).toBe(2);
  });

  it("two pairs in the same minute all get matched", async () => {
    const t = new Date("2026-01-15T10:00:30Z");
    const txns = [
      makeTxn({ id: "a", accountId: "acct-1", amountNative: 10000, startedAt: t }),
      makeTxn({ id: "b", accountId: "acct-2", amountNative: -10000, startedAt: t }),
      makeTxn({ id: "c", accountId: "acct-3", amountNative: 5000, startedAt: t }),
      makeTxn({ id: "d", accountId: "acct-4", amountNative: -5000, startedAt: t }),
    ];
    const db = makeDb(txns);
    const result = await applyTransferHeuristic(db, ["a", "b", "c", "d"]);
    expect(result).toBe(4);
  });
});
