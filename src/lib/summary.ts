import { and, eq, gte, isNull, lt, ne, or } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { transaction } from "@/lib/db/schema";

const INTERNAL_TRANSFER_CAT = "00000000-0000-0000-0002-000000000021";

export interface MonthlySummary {
  income: number;
  expenses: number;
  net: number;
  topCategories: { id: string; name: string; amount: number }[];
}

export async function getMonthlySummary(
  db: Db,
  tenantId: string,
  year: number,
  month: number,
): Promise<MonthlySummary> {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const txns = await db.query.transaction.findMany({
    where: and(
      eq(transaction.tenantId, tenantId),
      gte(transaction.startedAt, start),
      lt(transaction.startedAt, end),
      // Exclude internal transfers; keep uncategorized (NULL categoryId) transactions.
      or(isNull(transaction.categoryId), ne(transaction.categoryId, INTERNAL_TRANSFER_CAT)),
    ),
    columns: { amountNative: true, categoryId: true },
  });

  let income = 0;
  let expenses = 0;
  const catTotals = new Map<string, number>();

  for (const t of txns) {
    if (t.amountNative > 0) {
      income += t.amountNative;
    } else {
      expenses += t.amountNative;
      if (t.categoryId) {
        catTotals.set(t.categoryId, (catTotals.get(t.categoryId) ?? 0) + t.amountNative);
      }
    }
  }

  const topCatIds = [...catTotals.entries()]
    .sort(([, a], [, b]) => a - b) // most negative first
    .slice(0, 3)
    .map(([id]) => id);

  const cats =
    topCatIds.length > 0
      ? await db.query.category.findMany({
          where: (cat, { and, eq, inArray }) =>
            and(eq(cat.tenantId, tenantId), inArray(cat.id, topCatIds)),
          columns: { id: true, name: true },
        })
      : [];

  const catNameMap = new Map(cats.map((c) => [c.id, c.name]));

  return {
    income,
    expenses,
    net: income + expenses,
    topCategories: topCatIds.map((id) => ({
      id,
      name: catNameMap.get(id) ?? "Unknown",
      amount: catTotals.get(id) ?? 0,
    })),
  };
}

export function prevMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
