import { and, eq, gte, isNull, lt, ne, or } from "drizzle-orm";
import { requirePageAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { category, transaction } from "@/lib/db/schema";
import { monthLabel, prevMonth } from "@/lib/summary";

interface Props {
  searchParams: Promise<{ month?: string }>;
}

const INTERNAL_TRANSFER_CAT = "00000000-0000-0000-0002-000000000021";

function fmt(minor: number) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(minor / 100);
}

function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

function toParam(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export default async function CategoriesPage({ searchParams }: Props) {
  const { tenantId } = await requirePageAuth();

  // ── Month param ──────────────────────────────────────────────────────────
  const params = await searchParams;
  const raw = params.month ?? "";
  const now = new Date();
  let year: number, month: number;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) {
    year = parseInt(raw.slice(0, 4), 10);
    month = parseInt(raw.slice(5, 7), 10);
  } else {
    year = now.getUTCFullYear();
    month = now.getUTCMonth() + 1;
  }

  const curYear = now.getUTCFullYear();
  const curMonth = now.getUTCMonth() + 1;
  const isCurrentOrFuture =
    year > curYear || (year === curYear && month >= curMonth);

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  // ── Data ─────────────────────────────────────────────────────────────────
  const db = getDb();
  const [allCategories, txns] = await Promise.all([
    db.query.category.findMany({
      where: eq(category.tenantId, tenantId),
      columns: { id: true, name: true, parentId: true, kind: true },
    }),
    db.query.transaction.findMany({
      where: and(
        gte(transaction.startedAt, start),
        lt(transaction.startedAt, end),
        or(isNull(transaction.categoryId), ne(transaction.categoryId, INTERNAL_TRANSFER_CAT)),
      ),
      columns: { amountNative: true, categoryId: true },
    }),
  ]);

  // Aggregate spend per category
  const spending = new Map<string, { total: number; count: number }>();
  for (const t of txns) {
    if (!t.categoryId) continue;
    const prev = spending.get(t.categoryId) ?? { total: 0, count: 0 };
    spending.set(t.categoryId, { total: prev.total + t.amountNative, count: prev.count + 1 });
  }

  // Build tree
  const parents = allCategories
    .filter((c) => c.parentId === null && c.kind !== "transfer")
    .sort((a, b) => {
      // income first, then expense by spend (desc), then investment_flow
      const order = { income: 0, expense: 1, investment_flow: 2, transfer: 3 };
      if (a.kind !== b.kind) return (order[a.kind] ?? 9) - (order[b.kind] ?? 9);
      // within expense: sort by total spend descending (most negative = most spent)
      if (a.kind === "expense") {
        const aTotal = childTotal(a.id);
        const bTotal = childTotal(b.id);
        return aTotal - bTotal; // more negative = sorted first
      }
      return 0;
    });

  function childTotal(parentId: string): number {
    return allCategories
      .filter((c) => c.parentId === parentId)
      .reduce((sum, c) => sum + (spending.get(c.id)?.total ?? 0), 0);
  }

  function childrenOf(parentId: string) {
    return allCategories
      .filter((c) => c.parentId === parentId)
      .sort((a, b) => {
        const aAmt = spending.get(a.id)?.total ?? 0;
        const bAmt = spending.get(b.id)?.total ?? 0;
        if (a.kind === "income") return bAmt - aAmt;
        return aAmt - bAmt; // most negative first for expenses
      });
  }

  // Navigation
  const prev = prevMonth(year, month);
  const next = nextMonth(year, month);

  return (
    <div className="space-y-6 px-6 py-8">
      {/* Header + month picker */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-[#F7F4EE]">Categories</h1>
        <div className="flex items-center gap-3 text-sm">
          <a href={`/categories?month=${toParam(prev.year, prev.month)}`}
            className="text-[#C4B8A8] hover:text-[#F7F4EE] transition-colors">
            ← {monthLabel(prev.year, prev.month).split(" ")[0]}
          </a>
          <span className="text-[#C4B8A8] text-xs">{monthLabel(year, month)}</span>
          {!isCurrentOrFuture ? (
            <a href={`/categories?month=${toParam(next.year, next.month)}`}
              className="text-[#C4B8A8] hover:text-[#F7F4EE] transition-colors">
              {nextMonth(year, month) && monthLabel(next.year, next.month).split(" ")[0]} →
            </a>
          ) : (
            <span className="text-[#4A2E1A] text-sm select-none">→</span>
          )}
        </div>
      </div>

      {/* Category groups */}
      <div className="space-y-4">
        {parents.map((parent) => {
          const children = childrenOf(parent.id);
          const total = childTotal(parent.id);
          const isIncome = parent.kind === "income";
          const displayTotal = isIncome ? total : Math.abs(total);
          const hasActivity = total !== 0;

          return (
            <div key={parent.id} className="overflow-hidden rounded-xl border border-[#4A2E1A]">
              {/* Parent group header */}
              <div className="flex items-center justify-between bg-[#2C1A0E] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[#F7F4EE]">{parent.name}</span>
                  <span className="text-[#6B5040] text-xs capitalize">{parent.kind.replace("_", " ")}</span>
                </div>
                <span className={`font-mono tabular-nums text-sm font-semibold ${
                  !hasActivity ? "text-[#6B5040]" : isIncome ? "text-[#6BBF85]" : "text-[#F7F4EE]"
                }`}>
                  {hasActivity ? fmt(displayTotal) : "—"}
                </span>
              </div>

              {/* Leaf categories */}
              <div className="divide-y divide-[#4A2E1A] bg-[#3A2414]">
                {children.map((child) => {
                  const data = spending.get(child.id);
                  const amt = data?.total ?? 0;
                  const count = data?.count ?? 0;
                  const hasSpend = amt !== 0;
                  const displayAmt = isIncome ? amt : Math.abs(amt);

                  return (
                    <div key={child.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className={hasSpend ? "text-[#F7F4EE]" : "text-[#6B5040]"}>{child.name}</span>
                      <div className="flex items-center gap-3">
                        {hasSpend ? (
                          <>
                            <span className="text-[#6B5040] text-xs">{count} {count === 1 ? "txn" : "txns"}</span>
                            <span className={`font-mono tabular-nums ${isIncome ? "text-[#6BBF85]" : "text-[#F7F4EE]"}`}>
                              {fmt(displayAmt)}
                            </span>
                          </>
                        ) : (
                          <span className="text-[#6B5040]">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
