import { describe, expect, it, vi } from "vitest";
import { fanOut, runDetectors, selectNewDrafts, signalKey } from "@/lib/fraud/runner";
import type { Detector, FraudSignalDraft } from "@/lib/fraud/interface";
import type { Transaction } from "@/lib/db/schema";

function tx(id: string): Transaction {
  return { id } as unknown as Transaction;
}

function draft(detectorId: string, transactionId: string | null): FraudSignalDraft {
  return {
    detectorId,
    transactionId,
    severity: "warn",
    evidence: { reason: "test" },
    suggestedAction: "Review this transaction.",
  };
}

/** Fake Db: records fraud_signal inserts and audit rows; returns preset open signals. */
function makeFakeDb(existingOpen: { detectorId: string; transactionId: string | null }[]) {
  const inserted: Record<string, unknown>[] = [];
  const auditRows: Record<string, unknown>[] = [];

  const db = {
    select: () => ({
      from: () => ({
        where: async () => existingOpen,
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            inserted.push(v);
            return [{ id: `sig-${inserted.length}` }];
          },
        }),
      }),
    }),
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      const txClient = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: async () => [{ thisHash: Buffer.alloc(32, 0) }],
              }),
            }),
          }),
        }),
        insert: () => ({
          values: (v: Record<string, unknown>) => ({
            returning: async () => {
              auditRows.push(v);
              return [{ id: 1 }];
            },
          }),
        }),
      };
      return cb(txClient);
    },
  };

  return { db: db as never, inserted, auditRows };
}

describe("signalKey", () => {
  it("is stable per (detector, transaction) and null-safe", () => {
    expect(signalKey("vendor-bec", "t1")).toBe("vendor-bec::t1");
    expect(signalKey("vendor-bec", null)).toBe("vendor-bec::");
    expect(signalKey("a", "t1")).not.toBe(signalKey("b", "t1"));
  });
});

describe("selectNewDrafts", () => {
  it("drops drafts whose key already has an open signal", () => {
    const drafts = [draft("vendor-bec", "t1"), draft("subscription-trap", "t1")];
    const existing = new Set([signalKey("vendor-bec", "t1")]);
    const out = selectNewDrafts(drafts, existing);
    expect(out).toHaveLength(1);
    expect(out[0]!.detectorId).toBe("subscription-trap");
  });

  it("collapses duplicate drafts within a batch", () => {
    const drafts = [draft("vendor-bec", "t1"), draft("vendor-bec", "t1")];
    expect(selectNewDrafts(drafts, new Set())).toHaveLength(1);
  });
});

describe("fanOut", () => {
  const ctx = { db: {} as never, tenantId: "tenant-1" };

  it("runs every detector over every transaction", async () => {
    const d1: Detector = {
      id: "d1",
      run: vi.fn(async (_c, t) => [draft("d1", t.id)]),
    };
    const d2: Detector = {
      id: "d2",
      run: vi.fn(async (_c, t) => [draft("d2", t.id)]),
    };
    const drafts = await fanOut([d1, d2], ctx, [tx("t1"), tx("t2")]);
    expect(drafts).toHaveLength(4);
    expect(d1.run).toHaveBeenCalledTimes(2);
  });

  it("isolates a throwing detector — batch continues", async () => {
    const boom: Detector = {
      id: "boom",
      run: vi.fn(async () => {
        throw new Error("detector exploded");
      }),
    };
    const ok: Detector = { id: "ok", run: vi.fn(async (_c, t) => [draft("ok", t.id)]) };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const drafts = await fanOut([boom, ok], ctx, [tx("t1")]);
    errSpy.mockRestore();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.detectorId).toBe("ok");
  });
});

describe("runDetectors", () => {
  const tenantId = "00000000-0000-0000-0000-0000000000aa";

  it("short-circuits with no detectors and no DB access", async () => {
    const { db, inserted } = makeFakeDb([]);
    const res = await runDetectors(db, tenantId, [tx("t1")], []);
    expect(res).toEqual({ written: 0, skipped: 0 });
    expect(inserted).toHaveLength(0);
  });

  it("short-circuits with no transactions", async () => {
    const detector: Detector = { id: "d1", run: vi.fn() };
    const { db } = makeFakeDb([]);
    const res = await runDetectors(db, tenantId, [], [detector]);
    expect(res).toEqual({ written: 0, skipped: 0 });
    expect(detector.run).not.toHaveBeenCalled();
  });

  it("writes fresh signals and audits each one", async () => {
    const detector: Detector = {
      id: "vendor-bec",
      run: async (_c, t) => [draft("vendor-bec", t.id)],
    };
    const { db, inserted, auditRows } = makeFakeDb([]);
    const res = await runDetectors(db, tenantId, [tx("t1"), tx("t2")], [detector]);
    expect(res.written).toBe(2);
    expect(inserted).toHaveLength(2);
    expect(inserted[0]).toMatchObject({ tenantId, detectorId: "vendor-bec", severity: "warn" });
    expect(auditRows).toHaveLength(2);
    expect(auditRows[0]).toMatchObject({ action: "fraud_signal.create" });
  });

  it("skips a transaction that already has an open signal for the detector", async () => {
    const detector: Detector = {
      id: "vendor-bec",
      run: async (_c, t) => [draft("vendor-bec", t.id)],
    };
    const { db, inserted } = makeFakeDb([{ detectorId: "vendor-bec", transactionId: "t1" }]);
    const res = await runDetectors(db, tenantId, [tx("t1")], [detector]);
    expect(res).toEqual({ written: 0, skipped: 1 });
    expect(inserted).toHaveLength(0);
  });
});
