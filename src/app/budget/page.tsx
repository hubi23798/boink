import { and, eq, gte, inArray, lt, sum } from "drizzle-orm";
import { requirePageAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import {
  budgetTarget,
  category,
  transaction,
  user,
} from "@/lib/db/schema";
import { BudgetRow } from "./budget-row";
import type { Route } from "next";
import Link from "next/link";

interface Props {
  searchParams: Promise<{ month?: string }>;
}

function parseMonthParam(raw: string | undefined): string {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const parts = raw.split("-");
    const m = Number(parts[1]);
    if (m >= 1 && m <= 12) return raw;
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string): string {
  const parts = ym.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IE", { month: "long", year: "numeric" });
}

function shiftMonth(ym: string, delta: -1 | 1): string {
  const parts = ym.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmt(minor: number, currency: string) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(minor / 100);
}

export default async function BudgetPage({ searchParams }: Props) {
  const { tenantId, userId } = await requirePageAuth();

  const db = getDb();

  const params = await searchParams;
  const selectedMonth = parseMonthParam(params.month);
  const ymParts = selectedMonth.split("-");
  const year = Number(ymParts[0]);
  const month = Number(ymParts[1]);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const isCurrentMonth = selectedMonth === currentMonth;

  const prevMonthParam = shiftMonth(selectedMonth, -1);
  const nextMonthParam = shiftMonth(selectedMonth, 1);

  // Load user for base currency
  const [userRow] = await db
    .select({ baseCurrency: user.baseCurrency })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  const currency = userRow?.baseCurrency ?? "EUR";

  // Load all non-archived categories
  const allCats = await db.query.category.findMany({
    where: and(eq(category.tenantId, tenantId), eq(category.isArchived, false)),
    columns: { id: true, name: true, parentId: true, kind: true },
    orderBy: (c, { asc }) => [asc(c.name)],
  });

  const parentMap = new Map(allCats.filter((c) => !c.parentId).map((c) => [c.id, c.name]));
  const leafCats = allCats.filter(
    (c) => c.parentId !== null && (c.kind === "expense" || c.kind === "investment_flow"),
  );

  // Load budget targets
  const targets = await db.query.budgetTarget.findMany({
    where: eq(budgetTarget.tenantId, tenantId),
    columns: { categoryId: true, amountMonthly: true },
  });
  const targetMap = new Map(targets.map((t) => [t.categoryId, t.amountMonthly]));

  // Load monthly actuals
  const actualsMap = new Map<string, number>();
  const leafCategoryIds = leafCats.map((c) => c.id);
  if (leafCategoryIds.length > 0) {
    const rows = await db
      .select({
        categoryId: transaction.categoryId,
        total: sum(transaction.amountNative),
      })
      .from(transaction)
      .where(
        and(
          eq(transaction.tenantId, tenantId),
          inArray(transaction.categoryId, leafCategoryIds),
          gte(transaction.startedAt, monthStart),
          lt(transaction.startedAt, monthEnd),
          eq(transaction.state, "completed"),
          lt(transaction.amountNative, 0),
        ),
      )
      .groupBy(transaction.categoryId);

    for (const r of rows) {
      if (r.categoryId) {
        actualsMap.set(r.categoryId, Math.abs(Number(r.total ?? "0")));
      }
    }
  }

  // Group leaves by parent
  type LeafEntry = { id: string; name: string; parentId: string; kind: string };
  const groups = new Map<string, { parentName: string; leaves: LeafEntry[] }>();
  for (const leaf of leafCats) {
    const pId = leaf.parentId!;
    const parentName = parentMap.get(pId) ?? "Other";
    if (!groups.has(pId)) groups.set(pId, { parentName, leaves: [] });
    groups.get(pId)!.leaves.push(leaf as LeafEntry);
  }

  // Sort groups by parent name
  const sortedGroups = [...groups.entries()].sort((a, b) =>
    a[1].parentName.localeCompare(b[1].parentName),
  );

  return (
    <div className="space-y-6 px-6 py-8">
      {/* Header + month navigation */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#F7F4EE]">Budget</h1>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/budget?month=${prevMonthParam}` as Route} className="text-[#C4B8A8] hover:text-[#F7F4EE] px-1">←</Link>
          <span className="w-28 text-center font-medium text-[#F7F4EE]">{monthLabel(selectedMonth)}</span>
          {isCurrentMonth ? (
            <span className="text-[#4A2E1A] px-1">→</span>
          ) : (
            <Link href={`/budget?month=${nextMonthParam}` as Route} className="text-[#C4B8A8] hover:text-[#F7F4EE] px-1">→</Link>
          )}
          {!isCurrentMonth && (
            <Link href="/budget" className="text-[#C4B8A8] hover:text-[#F7F4EE] ml-2 text-xs underline">This month</Link>
          )}
        </div>
      </div>

      {leafCats.length === 0 ? (
        <p className="text-[#C4B8A8] text-sm">
          Add categories in{" "}
          <Link href="/settings/categories" className="text-[#6BBF85] underline">Settings → Categories</Link>{" "}
          first.
        </p>
      ) : (
        <div className="space-y-6">
          {sortedGroups.map(([parentId, { parentName, leaves }]) => {
            const groupActual = leaves.reduce((s, l) => s + (actualsMap.get(l.id) ?? 0), 0);
            const groupTarget = leaves.reduce((s, l) => s + (targetMap.get(l.id) ?? 0), 0);

            return (
              <section key={parentId} className="space-y-0 overflow-hidden rounded-xl border border-[#4A2E1A]">
                {/* Parent group header */}
                <div className="flex items-center justify-between border-b border-[#4A2E1A] bg-[#2C1A0E] px-4 py-2 text-xs font-semibold uppercase tracking-wide">
                  <span className="text-[#C4B8A8]">{parentName}</span>
                  <span className="text-[#6B5040] tabular-nums font-mono">
                    {fmt(groupActual, currency)} spent
                    {groupTarget > 0 && ` / ${fmt(groupTarget, currency)} target`}
                  </span>
                </div>

                {/* Leaf rows */}
                <div className="divide-y divide-[#4A2E1A] bg-[#3A2414]">
                  {leaves.map((leaf) => (
                    <BudgetRow
                      key={leaf.id}
                      categoryId={leaf.id}
                      categoryName={leaf.name}
                      initialTarget={targetMap.get(leaf.id) ?? null}
                      actual={actualsMap.get(leaf.id) ?? 0}
                      currency={currency}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
