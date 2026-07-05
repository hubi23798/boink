import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { requirePageAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import {
  account,
  balanceSnapshot,
  transaction,
  category,
} from "@/lib/db/schema";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AccountDetailPage({ params }: Props) {
  const { tenantId } = await requirePageAuth();

  const { id } = await params;
  const db = getDb();

  const acct = await db.query.account.findFirst({
    where: and(eq(account.id, id), eq(account.tenantId, tenantId)),
  });
  if (!acct) notFound();

  const [recentTxns, snapshots] = await Promise.all([
    db.query.transaction.findMany({
      where: eq(transaction.accountId, id),
      orderBy: [desc(transaction.startedAt)],
      limit: 50,
      columns: {
        id: true,
        startedAt: true,
        amountNative: true,
        feeNative: true,
        currency: true,
        descriptionRaw: true,
        state: true,
        categoryId: true,
      },
    }),
    db.query.balanceSnapshot.findMany({
      where: eq(balanceSnapshot.accountId, id),
      orderBy: [desc(balanceSnapshot.asOfDate)],
      limit: 30,
      columns: { asOfDate: true, balanceNative: true, balanceBaseCcy: true },
    }),
  ]);

  const categoryIds = [...new Set(recentTxns.map((t) => t.categoryId).filter(Boolean) as string[])];
  const categories =
    categoryIds.length > 0
      ? await db.query.category.findMany({
          where: (cat, { inArray }) => inArray(cat.id, categoryIds),
          columns: { id: true, name: true },
        })
      : [];
  const catName = new Map(categories.map((c) => [c.id, c.name]));

  function fmt(minor: number, ccy = acct!.currency) {
    return new Intl.NumberFormat("en-IE", { style: "currency", currency: ccy }).format(minor / 100);
  }

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <a href="/wealth/accounts" className="text-fg-muted text-sm hover:underline">← Accounts</a>
        <h1 className="mt-2 text-xl font-semibold">{acct.name}</h1>
        <p className="text-fg-muted mt-1 text-xs">
          {acct.currency} · {acct.kind}
          {acct.externalProvider ? ` · ${acct.externalProvider}` : ""}
        </p>
      </div>

      {snapshots[0] && (
        <div className="border-border-subtle rounded-xl border p-6">
          <p className="text-fg-muted text-sm">Balance as of {snapshots[0].asOfDate}</p>
          <p className="mt-1 text-3xl font-bold">{fmt(snapshots[0].balanceNative)}</p>
        </div>
      )}

      {snapshots.length > 1 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Balance history</h2>
          <div className="divide-border-subtle divide-y rounded-lg border text-sm">
            {snapshots.map((s) => (
              <div key={s.asOfDate} className="flex items-center justify-between px-3 py-2">
                <span className="text-fg-muted text-xs">{s.asOfDate}</span>
                <span>{fmt(s.balanceNative)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Recent transactions</h2>
        {recentTxns.length === 0 ? (
          <p className="text-fg-muted text-sm">No transactions yet.</p>
        ) : (
          <div className="divide-border-subtle divide-y rounded-lg border text-sm">
            {recentTxns.map((txn) => (
              <div key={txn.id} className="flex items-center justify-between p-3">
                <div className="min-w-0">
                  <p className="truncate">{txn.descriptionRaw || "—"}</p>
                  <p className="text-fg-muted text-xs">
                    {new Date(txn.startedAt).toLocaleDateString()}
                    {txn.categoryId ? ` · ${catName.get(txn.categoryId) ?? ""}` : " · uncategorized"}
                    {txn.state !== "completed" ? ` · ${txn.state}` : ""}
                  </p>
                </div>
                <span className={`shrink-0 ${txn.amountNative < 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                  {fmt(txn.amountNative)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
