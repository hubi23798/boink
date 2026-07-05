import { and, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { transaction } from "@/lib/db/schema";

// Fixed UUID for the "Internal Transfer" seed category
const INTERNAL_TRANSFER_CATEGORY_ID = "00000000-0000-0000-0002-000000000021";
const MINUTE_MS = 60_000;

export async function applyTransferHeuristic(db: Db, transactionIds: string[]): Promise<number> {
  if (transactionIds.length === 0) return 0;

  const transfers = await db.query.transaction.findMany({
    where: and(inArray(transaction.id, transactionIds), isNull(transaction.categoryId)),
  });

  // Only consider rows where typeRaw is 'Transfer' (case-insensitive)
  const candidates = transfers.filter((t) => (t.typeRaw ?? "").toLowerCase() === "transfer");

  if (candidates.length === 0) return 0;

  // Group by one-minute bucket (startedAt / 60 000 ms, floored)
  const byMinute = new Map<number, typeof candidates>();
  for (const t of candidates) {
    const bucket = Math.floor(t.startedAt.getTime() / MINUTE_MS);
    if (!byMinute.has(bucket)) byMinute.set(bucket, []);
    byMinute.get(bucket)!.push(t);
  }

  const pairedIds = new Set<string>();

  for (const group of byMinute.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        if (a.accountId !== b.accountId && a.amountNative + b.amountNative === 0) {
          pairedIds.add(a.id);
          pairedIds.add(b.id);
        }
      }
    }
  }

  if (pairedIds.size === 0) return 0;

  await db
    .update(transaction)
    .set({ categoryId: INTERNAL_TRANSFER_CATEGORY_ID, categorizedBy: "rule" })
    .where(and(inArray(transaction.id, [...pairedIds]), isNull(transaction.categoryId)));

  return pairedIds.size;
}
