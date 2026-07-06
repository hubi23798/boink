import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { AggregatorSource } from "@/lib/aggregators/interface";

const mockGetAccounts = vi.fn();
const mockGetTransactions = vi.fn();
const mockRefreshTokens = vi.fn();
const mockLoadTokens = vi.fn();
const mockUpdateTokens = vi.fn();
const mockResolveOwner = vi.fn();
const mockCategorize = vi.fn();
const mockRunDetectors = vi.fn();
const mockAppendAudit = vi.fn();

const mockDb = {
  query: {
    connection: { findFirst: vi.fn() },
    account: { findFirst: vi.fn() },
    transaction: { findMany: vi.fn() },
  },
  insert: vi.fn(),
  update: vi.fn(),
};

vi.mock("@/lib/aggregators/registry", () => ({
  getAggregatorSource: () =>
    ({
      provider: "truelayer",
      getAccounts: mockGetAccounts,
      getTransactions: mockGetTransactions,
      refreshTokens: mockRefreshTokens,
    }) satisfies Partial<AggregatorSource>,
}));

vi.mock("@/lib/aggregators/tokens", () => ({
  loadConnectionTokens: (...args: unknown[]) => mockLoadTokens(...args),
  updateConnectionTokens: (...args: unknown[]) => mockUpdateTokens(...args),
}));

vi.mock("@/lib/aggregators/tenant-owner", () => ({
  resolveTenantOwnerUserId: (...args: unknown[]) => mockResolveOwner(...args),
}));

vi.mock("@/lib/categorization/categorize", () => ({
  categorize: (...args: unknown[]) => mockCategorize(...args),
}));

vi.mock("@/lib/fraud/runner", () => ({
  runDetectors: (...args: unknown[]) => mockRunDetectors(...args),
}));

vi.mock("@/lib/audit/append", () => ({
  appendAudit: (...args: unknown[]) => mockAppendAudit(...args),
}));

import { syncConnection } from "@/lib/aggregators/truelayer/sync";
import { assertManualResyncRateLimit } from "@/lib/aggregators/sync-schedule";

describe("syncConnection", () => {
  beforeEach(() => {
    mockDb.query.connection.findFirst.mockResolvedValue({
      id: "conn-1",
      tenantId: "tenant-1",
      provider: "truelayer",
      accessTokenRef: "agg:tenant-1:truelayer:cred-1",
      status: "active",
      lastSyncedAt: null,
    });
    mockLoadTokens.mockResolvedValue({
      accessToken: "access",
      refreshToken: "refresh",
    });
    mockResolveOwner.mockResolvedValue("user-1");
    mockGetAccounts.mockResolvedValue([
      {
        id: "acc-ext-1",
        displayName: "Current",
        currency: "EUR",
        accountType: "TRANSACTION",
      },
    ]);
    mockGetTransactions.mockResolvedValue([
      {
        id: "txn-1",
        accountId: "acc-ext-1",
        amountMinor: -999,
        currency: "EUR",
        description: "Spotify",
        timestamp: new Date("2026-01-15T10:00:00Z"),
        state: "completed" as const,
      },
    ]);
    mockDb.query.account.findFirst.mockResolvedValue(null);
    let insertCall = 0;
    mockDb.insert.mockImplementation(() => ({
      values: () => {
        insertCall++;
        if (insertCall === 1) {
          return { returning: () => Promise.resolve([{ id: "acc-1" }]) };
        }
        if (insertCall === 2) {
          return { returning: () => Promise.resolve([{ id: "batch-1" }]) };
        }
        return {
          onConflictDoNothing: () => ({
            returning: () => Promise.resolve([{ id: "tx-1" }]),
          }),
        };
      },
    }));
    mockDb.update.mockReturnValue({
      set: () => ({ where: () => Promise.resolve() }),
    });
    mockDb.query.transaction.findMany.mockResolvedValue([{ id: "tx-1" }]);
    mockCategorize.mockResolvedValue(undefined);
    mockRunDetectors.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("imports accounts and transactions on first sync", async () => {
    const result = await syncConnection(mockDb as never, "conn-1");
    expect(result.accountsUpserted).toBe(1);
    expect(result.transactionsImported).toBe(1);
    expect(mockGetTransactions).toHaveBeenCalled();
    expect(mockCategorize).toHaveBeenCalledWith(mockDb, "tenant-1", ["tx-1"]);
  });

  it("marks connection error and audits on sync failure", async () => {
    mockGetAccounts.mockRejectedValue(new Error("TrueLayer API /data/v1/accounts failed (503)"));
    await expect(syncConnection(mockDb as never, "conn-1")).rejects.toThrow("503");
    expect(mockAppendAudit).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ action: "connection.sync_failed", targetId: "conn-1" }),
    );
  });
});

describe("assertManualResyncRateLimit", () => {
  it("allows resync when never synced", async () => {
    const db = {
      query: {
        connection: {
          findFirst: vi.fn().mockResolvedValue({ lastSyncedAt: null }),
        },
      },
    };
    await expect(assertManualResyncRateLimit(db as never, "conn-1")).resolves.toBeUndefined();
  });

  it("blocks resync within 15 minutes", async () => {
    const db = {
      query: {
        connection: {
          findFirst: vi.fn().mockResolvedValue({ lastSyncedAt: new Date() }),
        },
      },
    };
    await expect(assertManualResyncRateLimit(db as never, "conn-1")).rejects.toThrow(
      "resync_rate_limit",
    );
  });
});
