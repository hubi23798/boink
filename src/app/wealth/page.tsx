import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { requirePageAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { goal } from "@/lib/db/schema";
import { getNetWorthNow, getNetWorthHistory } from "@/lib/net-worth/engine";
import { buildForecast } from "@/lib/net-worth/forecast";
import { getLatestBalances } from "@/lib/goals/balance";
import { calculateGoalProgress } from "@/lib/goals/progress";
import { ForecastSection } from "./forecast-section";

function fmt(minor: number, currency = "EUR") {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(minor / 100);
}

export default async function WealthPage() {
  const { tenantId } = await requirePageAuth();

  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const [nw, history, goals] = await Promise.all([
    getNetWorthNow(db, tenantId),
    getNetWorthHistory(db, tenantId, 180),
    db
      .select()
      .from(goal)
      .where(and(eq(goal.tenantId, tenantId), eq(goal.isArchived, false)))
      .orderBy(asc(goal.createdAt)),
  ]);

  const forecast = buildForecast(history, today);

  const allLinkedIds = [...new Set(goals.flatMap((g) => g.linkedAccountIds))];
  const balances = await getLatestBalances(db, allLinkedIds);

  const goalsForForecast = goals.map((g) => {
    const linkedBalances = g.linkedAccountIds.map((id) => balances.get(id) ?? 0);
    const progress = calculateGoalProgress(
      {
        kind: g.kind,
        targetAmount: g.targetAmount,
        targetDate: g.targetDate ?? null,
        initialBalance: g.initialBalance ?? null,
      },
      linkedBalances,
      today,
    );
    return {
      id: g.id,
      name: g.name,
      targetAmount: g.targetAmount,
      currentAmount: progress.currentAmount,
    };
  });

  const kindLabel: Record<string, string> = {
    cash: "Cash",
    investment: "Investments",
    crypto: "Crypto",
    pension: "Pension",
    property: "Property",
    other_asset: "Other assets",
    liability: "Liabilities",
  };

  return (
    <div className="space-y-8 px-6 py-8">
      <div>
        <h1 className="text-xl font-semibold text-[#F7F4EE]">Wealth</h1>
        <p className="text-fg-muted mt-1 text-xs">As of {nw.asOf}</p>
      </div>

      <div className="rounded-xl border border-[#C9A84C]/40 bg-[#3A2414] p-6 shadow-[0_1px_4px_rgba(0,0,0,0.3)]">
        <p className="text-sm text-[#C4B8A8]">Net worth</p>
        <p className="mt-1 font-mono text-4xl font-bold tracking-tight text-[#C9A84C]">
          {fmt(nw.netWorth)}
        </p>
        <div className="mt-4 flex gap-6 text-sm">
          <div>
            <p className="text-xs text-[#C4B8A8]">Assets</p>
            <p className="font-mono font-medium text-[#6BBF85]">{fmt(nw.assets)}</p>
          </div>
          <div>
            <p className="text-xs text-[#C4B8A8]">Liabilities</p>
            <p className="font-mono font-medium text-[#E07070]">{fmt(nw.liabilities)}</p>
          </div>
        </div>
      </div>

      {Object.entries(nw.byKind).length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-[#C4B8A8]">Breakdown</h2>
          <div className="divide-y divide-[#4A2E1A] overflow-hidden rounded-xl border border-[#4A2E1A] bg-[#3A2414] text-sm">
            {Object.entries(nw.byKind)
              .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
              .map(([kind, amount]) => (
                <div key={kind} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-[#F7F4EE]">{kindLabel[kind] ?? kind}</span>
                  <span
                    className={`font-mono tabular-nums ${amount < 0 ? "text-[#E07070]" : "text-[#F7F4EE]"}`}
                  >
                    {fmt(amount)}
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}

      {nw.accounts.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">
            <Link href="/wealth/accounts" className="text-[#6BBF85] hover:underline">
              Accounts →
            </Link>
          </h2>
          <div className="divide-y divide-[#4A2E1A] overflow-hidden rounded-xl border border-[#4A2E1A] bg-[#3A2414] text-sm">
            {nw.accounts.map((acct) => (
              <a
                key={acct.id}
                href={`/wealth/accounts/${acct.id}`}
                className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-[#4A2E1A]"
              >
                <div>
                  <p className="font-medium text-[#F7F4EE]">{acct.name}</p>
                  <p className="text-xs text-[#C4B8A8]">
                    {acct.currency} · {acct.kind}
                  </p>
                </div>
                <span
                  className={`font-mono tabular-nums ${acct.balanceNative < 0 ? "text-[#E07070]" : "text-[#F7F4EE]"}`}
                >
                  {fmt(acct.balanceNative, acct.currency)}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      {forecast.historicalPoints.length > 1 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-[#C4B8A8]">Forecast</h2>
          <ForecastSection
            historicalPoints={forecast.historicalPoints}
            baseMonthlyDelta={forecast.monthlyDelta}
            currentNW={nw.netWorth}
            today={today}
            currency="EUR"
            goals={goalsForForecast}
            snapshotCount={history.length}
            earliestDate={history[0]?.date ?? null}
          />
        </section>
      )}
    </div>
  );
}
