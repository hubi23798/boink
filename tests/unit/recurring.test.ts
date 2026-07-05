import { describe, expect, it } from "vitest";
import { detectRecurring } from "@/lib/recurring/detect";

const ACCOUNT = "acct-1";

function d(dateStr: string) {
  return new Date(`${dateStr}T10:00:00Z`);
}

function txn(date: string, desc: string, amount: number) {
  return {
    accountId: ACCOUNT,
    descriptionRaw: desc,
    amountNative: amount,
    currency: "EUR",
    startedAt: d(date),
  };
}

describe("detectRecurring", () => {
  it("detects monthly recurring", () => {
    const txns = [
      txn("2026-01-01", "Property Rent", -120000),
      txn("2026-02-01", "Property Rent", -120000),
      txn("2026-03-01", "Property Rent", -120000),
      txn("2026-04-01", "Property Rent", -120000),
    ];
    const results = detectRecurring(txns, d("2026-04-15"));
    expect(results).toHaveLength(1);
    expect(results[0]!.frequency).toBe("monthly");
    expect(results[0]!.description).toBe("Property Rent");
    expect(results[0]!.amountNative).toBe(-120000);
  });

  it("detects weekly recurring", () => {
    const txns = [
      txn("2026-01-05", "Lidl", -6000),
      txn("2026-01-12", "Lidl", -5500),
      txn("2026-01-19", "Lidl", -7000),
      txn("2026-01-26", "Lidl", -6200),
    ];
    const results = detectRecurring(txns, d("2026-02-01"));
    expect(results).toHaveLength(1);
    expect(results[0]!.frequency).toBe("weekly");
  });

  it("detects fortnightly recurring", () => {
    const txns = [
      txn("2026-01-01", "Paycheck", 175000),
      txn("2026-01-15", "Paycheck", 175000),
      txn("2026-01-29", "Paycheck", 175000),
    ];
    const results = detectRecurring(txns, d("2026-02-10"));
    expect(results).toHaveLength(1);
    expect(results[0]!.frequency).toBe("fortnightly");
  });

  it("ignores single occurrence", () => {
    const txns = [txn("2026-01-01", "One-off purchase", -5000)];
    expect(detectRecurring(txns, d("2026-02-01"))).toHaveLength(0);
  });

  it("ignores irregular transactions", () => {
    const txns = [
      txn("2026-01-01", "Random shop", -1000),
      txn("2026-01-10", "Random shop", -2000),
      txn("2026-03-01", "Random shop", -1500), // 50-day gap — doesn't fit any bucket
    ];
    expect(detectRecurring(txns, d("2026-03-15"))).toHaveLength(0);
  });

  it("computes nextExpected correctly for monthly", () => {
    const txns = [
      txn("2026-01-05", "Netflix", -1799),
      txn("2026-02-05", "Netflix", -1799),
      txn("2026-03-05", "Netflix", -1799),
    ];
    const results = detectRecurring(txns, d("2026-03-10"));
    expect(results[0]!.nextExpected.toISOString().slice(0, 10)).toBe("2026-04-04");
  });

  it("separates same description from different accounts", () => {
    const txns = [
      {
        accountId: "acct-1",
        descriptionRaw: "Transfer",
        amountNative: -40000,
        currency: "EUR",
        startedAt: d("2026-01-01"),
      },
      {
        accountId: "acct-1",
        descriptionRaw: "Transfer",
        amountNative: -40000,
        currency: "EUR",
        startedAt: d("2026-02-01"),
      },
      {
        accountId: "acct-2",
        descriptionRaw: "Transfer",
        amountNative: 40000,
        currency: "EUR",
        startedAt: d("2026-01-01"),
      },
      {
        accountId: "acct-2",
        descriptionRaw: "Transfer",
        amountNative: 40000,
        currency: "EUR",
        startedAt: d("2026-02-01"),
      },
    ];
    const results = detectRecurring(txns, d("2026-02-15"));
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.accountId).sort()).toEqual(["acct-1", "acct-2"]);
  });
});
