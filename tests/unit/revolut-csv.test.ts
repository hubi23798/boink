import { describe, expect, it } from "vitest";
import { RevolutCsvSource } from "@/lib/ingestion/revolut-csv";

const VALID_HEADERS =
  "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance";

function makeCsv(rows: string[]): Buffer {
  return Buffer.from([VALID_HEADERS, ...rows].join("\n"));
}

const GOOD_ROW =
  "CARD_PAYMENT,Current,2026-01-15 10:00:00,2026-01-15 10:01:00,Spotify,-9.99,0.00,EUR,COMPLETED,990.01";
const GOOD_ROW2 =
  "TRANSFER,Deposit,2026-01-16 08:00:00,2026-01-16 08:00:30,Savings transfer,500.00,0.00,EUR,COMPLETED,1490.01";

const src = new RevolutCsvSource();

describe("RevolutCsvSource.parse", () => {
  describe("happy path", () => {
    it("parses a single valid row", () => {
      const { rows, rejections } = src.parse(makeCsv([GOOD_ROW]));
      expect(rejections).toHaveLength(0);
      expect(rows).toHaveLength(1);
    });

    it("parses multiple rows", () => {
      const { rows, rejections } = src.parse(makeCsv([GOOD_ROW, GOOD_ROW2]));
      expect(rejections).toHaveLength(0);
      expect(rows).toHaveLength(2);
    });

    it("normalizes amountNative to minor units (cents)", () => {
      const { rows } = src.parse(makeCsv([GOOD_ROW]));
      expect(rows[0]!.txn.amountNative).toBe(-999); // -9.99 * 100
    });

    it("rounds fractional cents correctly (e.g. 10.999 → 1100)", () => {
      const row = "CARD_PAYMENT,Current,2026-01-15 10:00:00,,Test,10.999,0.00,EUR,COMPLETED,";
      const { rows } = src.parse(makeCsv([row]));
      expect(rows[0]!.txn.amountNative).toBe(1100); // Math.round(10.999 * 100) = 1100
    });

    it("normalizes feeNative to minor units", () => {
      const row = "CARD_PAYMENT,Current,2026-01-15 10:00:00,,Test,-5.00,0.50,EUR,COMPLETED,";
      const { rows } = src.parse(makeCsv([row]));
      expect(rows[0]!.txn.feeNative).toBe(50);
    });

    it("parses startedAt as UTC timestamp", () => {
      const { rows } = src.parse(makeCsv([GOOD_ROW]));
      expect(rows[0]!.txn.startedAt.toISOString()).toBe("2026-01-15T10:00:00.000Z");
    });

    it("parses completedAt as UTC timestamp", () => {
      const { rows } = src.parse(makeCsv([GOOD_ROW]));
      expect(rows[0]!.txn.completedAt?.toISOString()).toBe("2026-01-15T10:01:00.000Z");
    });

    it("sets completedAt to null when Completed Date is empty", () => {
      const row = "CARD_PAYMENT,Current,2026-01-15 10:00:00,,Test,-5.00,0.00,EUR,COMPLETED,";
      const { rows } = src.parse(makeCsv([row]));
      expect(rows[0]!.txn.completedAt).toBeNull();
    });

    it("sets runningBalanceNative from Balance column", () => {
      const { rows } = src.parse(makeCsv([GOOD_ROW]));
      expect(rows[0]!.txn.runningBalanceNative).toBe(99001); // 990.01 * 100
    });

    it("sets runningBalanceNative to null when Balance is empty", () => {
      const row = "CARD_PAYMENT,Current,2026-01-15 10:00:00,,Test,-5.00,0.00,EUR,COMPLETED,";
      const { rows } = src.parse(makeCsv([row]));
      expect(rows[0]!.txn.runningBalanceNative).toBeNull();
    });

    it("maps COMPLETED → completed state", () => {
      const { rows } = src.parse(makeCsv([GOOD_ROW]));
      expect(rows[0]!.txn.state).toBe("completed");
    });

    it("maps PENDING → pending state", () => {
      const row = "CARD_PAYMENT,Current,2026-01-15 10:00:00,,Test,-5.00,0.00,EUR,PENDING,";
      const { rows } = src.parse(makeCsv([row]));
      expect(rows[0]!.txn.state).toBe("pending");
    });

    it("maps REVERTED → reverted state", () => {
      const row = "CARD_PAYMENT,Current,2026-01-15 10:00:00,,Test,-5.00,0.00,EUR,REVERTED,";
      const { rows } = src.parse(makeCsv([row]));
      expect(rows[0]!.txn.state).toBe("reverted");
    });

    it("maps DECLINED → declined state", () => {
      const row = "CARD_PAYMENT,Current,2026-01-15 10:00:00,,Test,-5.00,0.00,EUR,DECLINED,";
      const { rows } = src.parse(makeCsv([row]));
      expect(rows[0]!.txn.state).toBe("declined");
    });

    it("maps FAILED → failed state", () => {
      const row = "CARD_PAYMENT,Current,2026-01-15 10:00:00,,Test,-5.00,0.00,EUR,FAILED,";
      const { rows } = src.parse(makeCsv([row]));
      expect(rows[0]!.txn.state).toBe("failed");
    });

    it("is case-insensitive for state values", () => {
      const row = "CARD_PAYMENT,Current,2026-01-15 10:00:00,,Test,-5.00,0.00,EUR,completed,";
      const { rows } = src.parse(makeCsv([row]));
      expect(rows[0]!.txn.state).toBe("completed");
    });

    it("captures typeRaw and productRaw", () => {
      const { rows } = src.parse(makeCsv([GOOD_ROW]));
      expect(rows[0]!.txn.typeRaw).toBe("CARD_PAYMENT");
      expect(rows[0]!.txn.productRaw).toBe("Current");
    });

    it("generates deterministic externalId (SHA-256 of 5 fields)", () => {
      const { rows: a } = src.parse(makeCsv([GOOD_ROW]));
      const { rows: b } = src.parse(makeCsv([GOOD_ROW]));
      expect(a[0]!.txn.externalId).toBe(b[0]!.txn.externalId);
    });

    it("different rows produce different externalIds", () => {
      const { rows } = src.parse(makeCsv([GOOD_ROW, GOOD_ROW2]));
      expect(rows[0]!.txn.externalId).not.toBe(rows[1]!.txn.externalId);
    });
  });

  describe("account hints", () => {
    it("builds externalAccountId as currency|product", () => {
      const { rows } = src.parse(makeCsv([GOOD_ROW]));
      expect(rows[0]!.accountHint.externalAccountId).toBe("EUR|Current");
    });

    it("suggests 'Revolut EUR Current' for Current product", () => {
      const { rows } = src.parse(makeCsv([GOOD_ROW]));
      expect(rows[0]!.accountHint.suggestedName).toBe("Revolut EUR Current");
    });

    it("suggests 'Revolut EUR Savings' for Deposit product", () => {
      const { rows } = src.parse(makeCsv([GOOD_ROW2]));
      expect(rows[0]!.accountHint.suggestedName).toBe("Revolut EUR Savings");
    });

    it("sets kind=cash and isLiquid=true for all Revolut accounts", () => {
      const { rows } = src.parse(makeCsv([GOOD_ROW]));
      expect(rows[0]!.accountHint.suggestedKind).toBe("cash");
      expect(rows[0]!.accountHint.isLiquid).toBe(true);
    });
  });

  describe("rejection cases", () => {
    it("rejects rows with an unknown state", () => {
      const row = "CARD_PAYMENT,Current,2026-01-15 10:00:00,,Test,-5.00,0.00,EUR,UNKNOWN_STATE,";
      const { rows, rejections } = src.parse(makeCsv([row]));
      expect(rows).toHaveLength(0);
      expect(rejections).toHaveLength(1);
      expect(rejections[0]!.reason).toMatch(/unknown state/i);
    });

    it("rejects rows with an empty currency", () => {
      const row = "CARD_PAYMENT,Current,2026-01-15 10:00:00,,Test,-5.00,0.00,,COMPLETED,";
      const { rows, rejections } = src.parse(makeCsv([row]));
      expect(rows).toHaveLength(0);
      expect(rejections).toHaveLength(1);
      expect(rejections[0]!.reason).toMatch(/empty currency/i);
    });

    it("rejects rows with an empty product", () => {
      const row = "CARD_PAYMENT,,2026-01-15 10:00:00,,Test,-5.00,0.00,EUR,COMPLETED,";
      const { rows, rejections } = src.parse(makeCsv([row]));
      expect(rows).toHaveLength(0);
      expect(rejections).toHaveLength(1);
      expect(rejections[0]!.reason).toMatch(/empty product/i);
    });

    it("rejects rows with a missing Started Date", () => {
      const row = "CARD_PAYMENT,Current,,,Test,-5.00,0.00,EUR,COMPLETED,";
      const { rows, rejections } = src.parse(makeCsv([row]));
      expect(rows).toHaveLength(0);
      expect(rejections).toHaveLength(1);
      expect(rejections[0]!.reason).toMatch(/started date/i);
    });

    it("records the rowIndex (1-based) for rejected rows", () => {
      const bad = "CARD_PAYMENT,Current,2026-01-15 10:00:00,,Test,-5.00,0.00,EUR,UNKNOWN_STATE,";
      const { rejections } = src.parse(makeCsv([GOOD_ROW, bad]));
      expect(rejections[0]!.rowIndex).toBe(2);
    });

    it("accepts good rows and rejects bad rows in the same file", () => {
      const bad = "CARD_PAYMENT,Current,2026-01-15 10:00:00,,Test,-5.00,0.00,,COMPLETED,";
      const { rows, rejections } = src.parse(makeCsv([GOOD_ROW, bad]));
      expect(rows).toHaveLength(1);
      expect(rejections).toHaveLength(1);
    });
  });

  describe("structural errors", () => {
    it("throws when a required header is missing", () => {
      const badCsv = Buffer.from(
        "Type,Product,Started Date,Description,Amount,Fee,Currency,State,Balance\nCARD_PAYMENT,Current,2026-01-15 10:00:00,Spotify,-9.99,0.00,EUR,COMPLETED,990.01",
      );
      expect(() => src.parse(badCsv)).toThrow(/missing required columns/i);
    });

    it("throws when the file is empty", () => {
      expect(() => src.parse(Buffer.from(VALID_HEADERS))).toThrow(/empty/i);
    });

    it("throws when the buffer is not valid CSV", () => {
      expect(() => src.parse(Buffer.from("not\x00valid\x00csv"))).toThrow();
    });
  });
});
