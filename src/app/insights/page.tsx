import { and, eq, gte, isNull, lt, ne, or } from "drizzle-orm";
import { requirePageAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { category, transaction } from "@/lib/db/schema";
import { monthLabel } from "@/lib/summary";

interface Props {
  searchParams: Promise<{ month?: string }>;
}

const INTERNAL_TRANSFER_CAT = "00000000-0000-0000-0002-000000000021";
const BAR_MAX_PX = 96; // pixel height of the tallest bar

function fmt(minor: number) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(minor / 100);
}

function fmtSigned(minor: number) {
  const abs = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(
    Math.abs(minor) / 100,
  );
  return minor >= 0 ? `+${abs}` : `−${abs}`;
}

export default async function InsightsPage({ searchParams }: Props) {
  const { tenantId } = await requirePageAuth();

  // ── Selected month ────────────────────────────────────────────────────────
  const params = await searchParams;
  const now = new Date();
  const curYear = now.getUTCFullYear();
  const curMonth = now.getUTCMonth() + 1;

  const raw = params.month ?? "";
  let selYear: number, selMonth: number;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) {
    selYear = parseInt(raw.slice(0, 4), 10);
    selMonth = parseInt(raw.slice(5, 7), 10);
    // clamp to not exceed current month
    if (selYear > curYear || (selYear === curYear && selMonth > curMonth)) {
      selYear = curYear;
      selMonth = curMonth;
    }
  } else {
    selYear = curYear;
    selMonth = curMonth;
  }

  // ── 6-month window (always ending at current month) ───────────────────────
  const months: { year: number; month: number; key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(curYear, curMonth - 1 - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    months.push({
      year: y,
      month: m,
      key: `${y}-${String(m).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-IE", { month: "short", timeZone: "UTC" }),
    });
  }

  // Clamp selected month to the window if it falls outside
  const windowKeys = new Set(months.map((m) => m.key));
  const selKey = `${selYear}-${String(selMonth).padStart(2, "0")}`;
  // months is always exactly 6 elements (loop i=5..0), so [0] and [5] are safe
  const lastMonth = months[months.length - 1]!;
  const firstMonth = months[0]!;
  const effectiveKey = windowKeys.has(selKey) ? selKey : lastMonth.key;
  const effectiveSel = months.find((m) => m.key === effectiveKey) ?? lastMonth;

  // ── Single query for the full window ──────────────────────────────────────
  const windowStart = new Date(Date.UTC(firstMonth.year, firstMonth.month - 1, 1));
  const windowEnd = new Date(Date.UTC(curYear, curMonth, 1));

  const db = getDb();
  const [txns, allCategories] = await Promise.all([
    db.query.transaction.findMany({
      where: and(
        eq(transaction.tenantId, tenantId),
        gte(transaction.startedAt, windowStart),
        lt(transaction.startedAt, windowEnd),
        or(isNull(transaction.categoryId), ne(transaction.categoryId, INTERNAL_TRANSFER_CAT)),
      ),
      columns: { amountNative: true, categoryId: true, startedAt: true },
    }),
    db.query.category.findMany({
      where: eq(category.tenantId, tenantId),
      columns: { id: true, name: true },
    }),
  ]);

  const catNameMap = new Map(allCategories.map((c) => [c.id, c.name]));

  // ── Aggregate ─────────────────────────────────────────────────────────────
  const monthlyMap = new Map<string, { income: number; expenses: number }>();
  const catTotalsForSel = new Map<string, number>();

  for (const t of txns) {
    const tYear = t.startedAt.getUTCFullYear();
    const tMonth = t.startedAt.getUTCMonth() + 1;
    const key = `${tYear}-${String(tMonth).padStart(2, "0")}`;
    const prev = monthlyMap.get(key) ?? { income: 0, expenses: 0 };

    if (t.amountNative > 0) {
      monthlyMap.set(key, { ...prev, income: prev.income + t.amountNative });
    } else {
      monthlyMap.set(key, { ...prev, expenses: prev.expenses + t.amountNative });
    }

    if (key === effectiveKey && t.amountNative < 0 && t.categoryId) {
      catTotalsForSel.set(
        t.categoryId,
        (catTotalsForSel.get(t.categoryId) ?? 0) + t.amountNative,
      );
    }
  }

  // ── Bar chart data ────────────────────────────────────────────────────────
  const monthlyData = months.map((m) => {
    const data = monthlyMap.get(m.key) ?? { income: 0, expenses: 0 };
    return { ...m, income: data.income, expenses: Math.abs(data.expenses) };
  });

  const maxValue = Math.max(...monthlyData.flatMap((m) => [m.income, m.expenses]), 1);

  function barPx(value: number): number {
    return Math.round((value / maxValue) * BAR_MAX_PX);
  }

  // ── Selected month summary ────────────────────────────────────────────────
  const selMonthData = monthlyMap.get(effectiveKey) ?? { income: 0, expenses: 0 };
  const selNet = selMonthData.income + selMonthData.expenses;

  // ── Category breakdown ────────────────────────────────────────────────────
  const rankedCats = [...catTotalsForSel.entries()]
    .sort(([, a], [, b]) => a - b)
    .map(([id, amount]) => ({ id, name: catNameMap.get(id) ?? "Unknown", amount }));

  const maxCatAmount = rankedCats.reduce((max, c) => Math.max(max, Math.abs(c.amount)), 1);

  return (
    <div className="space-y-8 px-6 py-8">
      <h1 className="text-xl font-semibold text-[#F7F4EE]">Insights</h1>

      {/* 6-month bar chart */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-[#C4B8A8]">6-month trend</h2>
          <div className="flex gap-3 text-xs">
            <span className="flex items-center gap-1 text-[#C4B8A8]">
              <span className="inline-block h-2 w-2 rounded-sm bg-[#6BBF85]" />
              Income
            </span>
            <span className="flex items-center gap-1 text-[#C4B8A8]">
              <span className="inline-block h-2 w-2 rounded-sm bg-[#C9A84C]/60" />
              Spending
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-[#4A2E1A] bg-[#3A2414] px-4 pb-4 pt-6">
          <div className="flex items-end gap-2">
            {monthlyData.map((m) => {
              const isSelected = m.key === effectiveKey;
              const incH = barPx(m.income);
              const expH = barPx(m.expenses);

              return (
                <a key={m.key} href={`/insights?month=${m.key}`}
                  className={`group flex flex-1 flex-col items-center gap-2 transition-opacity ${isSelected ? "" : "opacity-40 hover:opacity-75"}`}
                >
                  <div className="flex w-full items-end gap-0.5" style={{ height: `${BAR_MAX_PX}px` }}>
                    {m.income > 0 ? (
                      <div className="flex-1 rounded-t bg-[#6BBF85]" style={{ height: `${Math.max(incH, 2)}px` }} />
                    ) : (
                      <div className="flex-1" />
                    )}
                    <div className="flex-1 rounded-t bg-[#C9A84C]/60" style={{ height: `${Math.max(expH, 2)}px` }} />
                  </div>
                  <span className={`text-xs ${isSelected ? "font-semibold text-[#F7F4EE]" : "text-[#6B5040]"}`}>
                    {m.label}
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* Selected month breakdown */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-[#C4B8A8]">
            {monthLabel(effectiveSel.year, effectiveSel.month)}
          </h2>
          <div className="flex flex-wrap gap-4 text-xs">
            {selMonthData.income > 0 && (
              <span className="text-[#6B5040]">
                Income <span className="font-mono font-medium text-[#6BBF85]">{fmt(selMonthData.income)}</span>
              </span>
            )}
            {selMonthData.expenses < 0 && (
              <span className="text-[#6B5040]">
                Spending <span className="font-mono font-medium text-[#F7F4EE]">{fmt(Math.abs(selMonthData.expenses))}</span>
              </span>
            )}
            <span className="text-[#6B5040]">
              Net <span className={`font-mono font-medium ${selNet >= 0 ? "text-[#6BBF85]" : "text-[#E07070]"}`}>{fmtSigned(selNet)}</span>
            </span>
          </div>
        </div>

        {rankedCats.length > 0 ? (
          <div className="space-y-3">
            {rankedCats.map((cat) => {
              const pct = (Math.abs(cat.amount) / maxCatAmount) * 100;
              return (
                <div key={cat.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#F7F4EE]">{cat.name}</span>
                    <span className="font-mono text-[#C4B8A8] tabular-nums">{fmt(Math.abs(cat.amount))}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#4A2E1A]">
                    <div className="h-full rounded-full bg-[#C9A84C]/70" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[#C4B8A8] text-sm">No spending recorded for this month.</p>
        )}
      </section>
    </div>
  );
}
