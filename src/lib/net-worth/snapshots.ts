import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { account, balanceSnapshot, transaction } from "@/lib/db/schema";
import { getFxRate } from "@/lib/fx/rates";

async function getLedgerBalance(db: Db, accountId: string, asOfDate: string): Promise<number> {
  const result = await db
    .select({
      total: sql<string>`COALESCE(SUM(${transaction.amountNative} - ${transaction.feeNative}), 0)`,
    })
    .from(transaction)
    .where(
      and(
        eq(transaction.accountId, accountId),
        eq(transaction.state, "completed"),
        isNotNull(transaction.completedAt),
        sql`DATE(${transaction.completedAt} AT TIME ZONE 'UTC') <= ${asOfDate}`,
      ),
    );
  return parseInt(result[0]?.total ?? "0", 10);
}

async function upsertSnapshot(
  db: Db,
  tenantId: string,
  accountId: string,
  asOfDate: string,
  balanceNative: number,
  balanceBaseCcy: number,
) {
  await db
    .insert(balanceSnapshot)
    .values({ tenantId, accountId, asOfDate, balanceNative, balanceBaseCcy })
    .onConflictDoUpdate({
      target: [balanceSnapshot.accountId, balanceSnapshot.asOfDate],
      set: { balanceNative, balanceBaseCcy },
    });
}

/**
 * Write today's balance snapshot for every active account.
 * Called by the daily cron.
 */
export async function writeDailySnapshots(db: Db, tenantId: string): Promise<number> {
  const today = new Date().toISOString().split("T")[0]!;
  const accounts = await db.query.account.findMany({
    where: and(eq(account.tenantId, tenantId), eq(account.isActive, true)),
    columns: { id: true, currency: true, kind: true },
  });

  let count = 0;
  for (const acct of accounts) {
    const balanceNative = await getLedgerBalance(db, acct.id, today);
    const rate = await getFxRate(db, acct.currency, today);
    const balanceBaseCcy = Math.round(balanceNative / rate);
    await upsertSnapshot(db, tenantId, acct.id, today, balanceNative, balanceBaseCcy);
    count++;
  }
  return count;
}

/**
 * Backfill balance snapshots for all active accounts from their first
 * transaction date to today. Idempotent — uses upsert.
 * Called once after the first successful import.
 */
export async function backfillSnapshots(db: Db, tenantId: string): Promise<number> {
  const accounts = await db.query.account.findMany({
    where: and(eq(account.tenantId, tenantId), eq(account.isActive, true)),
    columns: { id: true, currency: true, kind: true },
  });

  let total = 0;

  for (const acct of accounts) {
    // Get all distinct dates with completed transactions for this account
    const dates = await db
      .selectDistinct({
        asOfDate: sql<string>`DATE(${transaction.completedAt} AT TIME ZONE 'UTC')::text`,
      })
      .from(transaction)
      .where(
        and(
          eq(transaction.accountId, acct.id),
          eq(transaction.state, "completed"),
          isNotNull(transaction.completedAt),
        ),
      )
      .orderBy(sql`DATE(${transaction.completedAt} AT TIME ZONE 'UTC')`);

    for (const { asOfDate } of dates) {
      if (!asOfDate) continue;
      const balanceNative = await getLedgerBalance(db, acct.id, asOfDate);
      const rate = await getFxRate(db, acct.currency, asOfDate);
      const balanceBaseCcy = Math.round(balanceNative / rate);
      await upsertSnapshot(db, tenantId, acct.id, asOfDate, balanceNative, balanceBaseCcy);
      total++;
    }
  }

  return total;
}
