import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { account, balanceSnapshot, transaction } from "@/lib/db/schema";
import { getFxRate } from "@/lib/fx/rates";

export interface AccountBalance {
  id: string;
  name: string;
  kind: string;
  currency: string;
  isLiquid: boolean;
  balanceNative: number;
  balanceBaseCcy: number;
}

export interface NetWorthNow {
  netWorth: number;
  assets: number;
  liabilities: number;
  asOf: string;
  byKind: Record<string, number>;
  accounts: AccountBalance[];
}

export interface NetWorthPoint {
  date: string;
  netWorth: number;
  assets: number;
  liabilities: number;
}

async function getLedgerBalance(db: Db, accountId: string): Promise<number> {
  const result = await db
    .select({
      total: sql<string>`COALESCE(SUM(${transaction.amountNative} - ${transaction.feeNative}), 0)`,
    })
    .from(transaction)
    .where(and(eq(transaction.accountId, accountId), eq(transaction.state, "completed")));
  return parseInt(result[0]?.total ?? "0", 10);
}

/**
 * Point-in-time net worth as of today.
 * Ledger-derived balance for all transactional accounts.
 * Amounts in base-currency minor units (EUR cents).
 */
export async function getNetWorthNow(db: Db, tenantId: string): Promise<NetWorthNow> {
  const today = new Date().toISOString().split("T")[0]!;

  const accounts = await db.query.account.findMany({
    where: and(eq(account.tenantId, tenantId), eq(account.isActive, true)),
    columns: { id: true, name: true, kind: true, currency: true, isLiquid: true },
  });

  const balances: AccountBalance[] = [];
  let assets = 0;
  let liabilities = 0;
  const byKind: Record<string, number> = {};

  for (const acct of accounts) {
    const balanceNative = await getLedgerBalance(db, acct.id);
    const rate = await getFxRate(db, acct.currency, today);
    const balanceBaseCcy = Math.round(balanceNative / rate);

    balances.push({ ...acct, balanceNative, balanceBaseCcy });

    if (acct.kind === "liability") {
      // Stored as negative (payments reduce the balance); treat absolute as liability
      liabilities += Math.abs(balanceBaseCcy);
    } else {
      assets += balanceBaseCcy;
    }

    byKind[acct.kind] = (byKind[acct.kind] ?? 0) + balanceBaseCcy;
  }

  return {
    netWorth: assets - liabilities,
    assets,
    liabilities,
    asOf: today,
    byKind,
    accounts: balances,
  };
}

/**
 * Historical net worth time series from balance_snapshot.
 * Aggregates across all active accounts per date.
 */
export async function getNetWorthHistory(
  db: Db,
  tenantId: string,
  limit = 365,
): Promise<NetWorthPoint[]> {
  const accounts = await db.query.account.findMany({
    where: and(eq(account.tenantId, tenantId), eq(account.isActive, true)),
    columns: { id: true, kind: true },
  });

  if (accounts.length === 0) return [];

  const accountIds = accounts.map((a) => a.id);
  const kindOf = new Map(accounts.map((a) => [a.id, a.kind]));

  // Get all snapshots for active accounts, ordered by date
  const snapshots = await db.query.balanceSnapshot.findMany({
    where: and(
      isNotNull(balanceSnapshot.accountId),
      // Filter to active account IDs via subquery would be cleaner,
      // but for a personal app with few accounts, in-memory filter is fine.
    ),
    orderBy: [asc(balanceSnapshot.asOfDate)],
    columns: { accountId: true, asOfDate: true, balanceBaseCcy: true },
  });

  const filtered = snapshots.filter((s) => accountIds.includes(s.accountId));

  // Group by date
  const byDate = new Map<string, { assets: number; liabilities: number }>();
  for (const snap of filtered) {
    const entry = byDate.get(snap.asOfDate) ?? { assets: 0, liabilities: 0 };
    const kind = kindOf.get(snap.accountId) ?? "other_asset";
    if (kind === "liability") {
      entry.liabilities += Math.abs(snap.balanceBaseCcy);
    } else {
      entry.assets += snap.balanceBaseCcy;
    }
    byDate.set(snap.asOfDate, entry);
  }

  const points = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-limit)
    .map(([date, { assets, liabilities }]) => ({
      date,
      netWorth: assets - liabilities,
      assets,
      liabilities,
    }));

  return points;
}
