import { redirect } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth/guard";
import { requirePageAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { getNetWorthNow } from "@/lib/net-worth/engine";
import { getMonthlySummary, monthLabel, prevMonth } from "@/lib/summary";
import { advisorConversation, transaction } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { KpiCard, KpiGrid } from "@/components/kpi-card";
import { TransactionList, type Transaction } from "@/components/transaction-row";
import {
  TrendingUp, Wallet, CreditCard, PiggyBank,
  MessageSquare, ArrowRight, Inbox,
} from "lucide-react";

function fmt(minor: number, currency = "EUR") {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(minor / 100);
}

function fmtSigned(minor: number, currency = "EUR") {
  const abs = new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(
    Math.abs(minor) / 100,
  );
  return minor >= 0 ? `+${abs}` : `−${abs}`;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function HomePage() {
  const { tenantId } = await requirePageAuth();

  const db = getDb();
  const now = new Date();
  const curYear = now.getUTCFullYear();
  const curMonth = now.getUTCMonth() + 1;
  const prev = prevMonth(curYear, curMonth);

  const [nw, thisMo, lastMo, recentTxns, uncategorizedCount, latestDebrief] = await Promise.all([
    getNetWorthNow(db, tenantId),
    getMonthlySummary(db, tenantId, curYear, curMonth),
    getMonthlySummary(db, tenantId, prev.year, prev.month),
    db.query.transaction.findMany({
      where: eq(transaction.tenantId, tenantId),
      orderBy: [desc(transaction.startedAt)],
      limit: 8,
      columns: {
        id: true,
        startedAt: true,
        amountNative: true,
        currency: true,
        descriptionRaw: true,
        categoryId: true,
      },
    }),
    db.$count(transaction, and(eq(transaction.tenantId, tenantId), isNull(transaction.categoryId))),
    db.query.weeklyDebrief.findFirst({
      where: (d, { eq }) => eq(d.tenantId, tenantId),
      orderBy: (d, { desc }) => [desc(d.weekStart)],
      columns: { narrativeText: true, flags: true, weekStart: true, weekEnd: true },
    }),
  ]);

  const categoryIds = [
    ...new Set(
      [...recentTxns.map((t) => t.categoryId), ...thisMo.topCategories.map((c) => c.id)]
        .filter(Boolean) as string[],
    ),
  ];
  const categoriesData =
    categoryIds.length > 0
      ? await db.query.category.findMany({
          where: (cat, { and, eq, inArray }) =>
            and(eq(cat.tenantId, tenantId), inArray(cat.id, categoryIds)),
          columns: { id: true, name: true },
        })
      : [];
  const catName = new Map(categoriesData.map((c) => [c.id, c.name]));

  const netDelta = thisMo.net - lastMo.net;
  const hasMonthlyData = thisMo.income > 0 || thisMo.expenses < 0;
  const hasLastMo = lastMo.income > 0 || lastMo.expenses < 0;
  const savingsRate =
    thisMo.income > 0 ? Math.round((thisMo.net / thisMo.income) * 100) : null;

  const mappedTxns: Transaction[] = recentTxns.map((txn) => ({
    id: txn.id,
    merchant: txn.descriptionRaw || "Unknown",
    category: txn.categoryId ? (catName.get(txn.categoryId) ?? null) : null,
    date: txn.startedAt.toISOString(),
    amountCents: txn.amountNative,
    currency: txn.currency ?? "EUR",
  }));

  async function createConversationWithQuestion(q: string) {
    "use server";
    const ctx = await getAuthContext();
    if (!ctx) redirect("/login");
    const db2 = getDb();
    const [conv] = await db2
      .insert(advisorConversation)
      .values({ tenantId: ctx.tenantId, userId: ctx.userId, title: q.slice(0, 60) })
      .returning({ id: advisorConversation.id });
    redirect(`/advisor/c/${conv!.id}?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-8 py-10">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <header className="space-y-1">
        <p className="text-caption text-fg-subtle">{greeting()}</p>
        <h1 className="text-h1 text-fg-default">Your money, today</h1>
      </header>

      {/* ── Hero: Net worth + monthly KPIs ──────────────────────────────── */}
      <section className="space-y-4">
        <KpiCard
          variant="hero"
          testId="net-worth-hero"
          label={`Net Worth · as of ${nw.asOf}`}
          value={fmt(nw.netWorth)}
          delta={
            hasLastMo
              ? `${fmtSigned(netDelta)} vs ${monthLabel(prev.year, prev.month)}`
              : undefined
          }
          deltaDirection={netDelta >= 0 ? "up" : "down"}
          icon={TrendingUp}
        />

        {hasMonthlyData && (
          <KpiGrid>
            <KpiCard
              label="Income"
              value={thisMo.income > 0 ? fmt(thisMo.income) : "—"}
              delta={
                lastMo.income > 0
                  ? `${fmtSigned(thisMo.income - lastMo.income)} vs last mo`
                  : undefined
              }
              deltaDirection={thisMo.income >= lastMo.income ? "up" : "down"}
              icon={Wallet}
            />
            <KpiCard
              label="Spending"
              value={fmt(Math.abs(thisMo.expenses))}
              delta={
                lastMo.expenses < 0
                  ? `${fmtSigned(Math.abs(thisMo.expenses) - Math.abs(lastMo.expenses))} vs last mo`
                  : undefined
              }
              deltaDirection={
                Math.abs(thisMo.expenses) <= Math.abs(lastMo.expenses) ? "up" : "down"
              }
              icon={CreditCard}
            />
            <KpiCard
              label="Net"
              value={fmt(thisMo.net)}
              delta={hasLastMo ? `${fmtSigned(netDelta)} vs last mo` : undefined}
              deltaDirection={thisMo.net >= 0 ? "up" : "down"}
              icon={TrendingUp}
            />
            {savingsRate !== null && (
              <KpiCard
                label="Savings Rate"
                value={`${savingsRate}%`}
                icon={PiggyBank}
                deltaDirection={
                  savingsRate >= 20 ? "up" : savingsRate >= 0 ? "neutral" : "down"
                }
              />
            )}
          </KpiGrid>
        )}
      </section>

      {/* ── Two-column lower grid ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Left: Recent transactions (wider) */}
        <section className="space-y-3 lg:col-span-3">
          <SectionHeader title="Recent activity" actionHref="/transactions" actionLabel="View all" />
          {mappedTxns.length > 0 ? (
            <TransactionList transactions={mappedTxns} />
          ) : (
            <EmptyCard message="No transactions yet." />
          )}
        </section>

        {/* Right: Next actions + advisor */}
        <aside className="space-y-6 lg:col-span-2">
          {uncategorizedCount > 0 && (
            <section className="space-y-3">
              <SectionHeader title="Next actions" />
              <a
                href="/transactions/inbox"
                className="group flex items-center gap-3 rounded-lg border border-line bg-card p-4 shadow-sm transition-colors hover:bg-elevated"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gold-bg">
                  <Inbox className="h-5 w-5 text-gold" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-body-strong text-fg-default">Categorize transactions</p>
                  <p className="text-[12px] text-fg-muted">
                    {uncategorizedCount} pending
                  </p>
                </div>
                <ArrowRight
                  className="h-4 w-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg-muted"
                  aria-hidden="true"
                />
              </a>
            </section>
          )}

          <section className="space-y-3">
            <SectionHeader title="Ask your advisor" actionHref="/advisor" actionLabel="Open" />
            <div className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
              {(
                [
                  "How did I do this month?",
                  "Am I on track with my budget?",
                  "What are my biggest subscriptions?",
                ] as const
              ).map((q, i) => (
                <form key={q} action={createConversationWithQuestion.bind(null, q)}>
                  <button
                    type="submit"
                    className={cn(
                      "group flex w-full items-start gap-3 px-4 py-3 text-left text-body text-fg-muted",
                      "transition-colors hover:bg-elevated hover:text-fg-default",
                      i > 0 && "border-t border-line",
                    )}
                  >
                    <MessageSquare
                      className="mt-0.5 h-4 w-4 shrink-0 text-gold"
                      strokeWidth={1.75}
                    />
                    <span className="flex-1">{q}</span>
                  </button>
                </form>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {/* ── Weekly debrief (full-width) ─────────────────────────────────── */}
      {latestDebrief && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-h2 text-fg-default">Weekly debrief</h2>
            <span className="font-mono text-[12px] text-fg-subtle tabular-nums">
              {latestDebrief.weekStart} – {latestDebrief.weekEnd}
            </span>
          </div>
          <article className="rounded-lg border border-line bg-card p-5 shadow-sm">
            <p className="text-body leading-relaxed text-fg-default">
              {latestDebrief.narrativeText}
            </p>
            {latestDebrief.flags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {latestDebrief.flags.map((flag, i) => (
                  <DebriefFlag key={i} flag={flag} />
                ))}
              </div>
            )}
          </article>
        </section>
      )}

    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Local helpers — only used here, so kept colocated
 * ──────────────────────────────────────────────────────────────────────── */

function SectionHeader({
  title,
  actionHref,
  actionLabel,
}: {
  title: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-h2 text-fg-default">{title}</h2>
      {actionHref && actionLabel && (
        <a
          href={actionHref}
          className="text-[12px] font-semibold text-gold hover:text-gold-hover transition-colors"
        >
          {actionLabel} →
        </a>
      )}
    </div>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-card/40 px-4 py-8 text-center text-body text-fg-muted">
      {message}
    </div>
  );
}

type DebriefFlagData =
  | { kind: "spending_spike"; category: string; message: string }
  | { kind: "spending_drop"; category: string; message: string }
  | { kind: "budget_overrun"; category: string; message: string }
  | { kind: "recurring_due"; name: string; message: string }
  | { kind: "income_change"; message: string }
  | { kind: "new_category"; category: string; message: string };

function DebriefFlag({ flag }: { flag: DebriefFlagData }) {
  const negative = flag.kind === "spending_spike" || flag.kind === "budget_overrun";
  const positive = flag.kind === "spending_drop";
  const colorClass = negative
    ? "bg-danger-bg text-danger"
    : positive
      ? "bg-success-bg text-success"
      : "bg-gold-bg text-gold";

  let label = "";
  if (flag.kind === "spending_spike") label = `↑ ${flag.category}`;
  else if (flag.kind === "spending_drop") label = `↓ ${flag.category}`;
  else if (flag.kind === "budget_overrun") label = `Over budget: ${flag.category}`;
  else if (flag.kind === "recurring_due") label = `Due: ${flag.name}`;
  else if (flag.kind === "income_change") label = "Income changed";
  else if (flag.kind === "new_category") label = `New: ${flag.category}`;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${colorClass}`}
      title={flag.message}
    >
      {label}
    </span>
  );
}
