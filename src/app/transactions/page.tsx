import { and, desc, eq, gte, ilike, isNull, lte } from "drizzle-orm";
import { requirePageAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { account, category, transaction } from "@/lib/db/schema";

interface Props {
  searchParams: Promise<{
    accountId?: string;
    categoryId?: string;
    q?: string;
    from?: string;
    to?: string;
    uncategorized?: string;
  }>;
}

function fmt(minor: number, currency = "EUR") {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(minor / 100);
}

export default async function TransactionsPage({ searchParams }: Props) {
  const { tenantId } = await requirePageAuth();

  const db = getDb();
  const filters = await searchParams;

  const [accounts, allCategories] = await Promise.all([
    db.query.account.findMany({
      where: eq(account.tenantId, tenantId),
      columns: { id: true, name: true, currency: true },
      orderBy: (a, { asc }) => [asc(a.name)],
    }),
    db.query.category.findMany({
      where: eq(category.tenantId, tenantId),
      columns: { id: true, name: true, kind: true, parentId: true },
      orderBy: (c, { asc }) => [asc(c.name)],
    }),
  ]);

  // Build expense/income leaf categories for the dropdown (exclude transfer)
  const leafCategories = allCategories.filter(
    (c) => c.parentId !== null && c.kind !== "transfer",
  );

  const conditions = [eq(transaction.tenantId, tenantId)];
  if (filters.accountId) conditions.push(eq(transaction.accountId, filters.accountId));
  if (filters.from) conditions.push(gte(transaction.startedAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(transaction.startedAt, new Date(filters.to + "T23:59:59Z")));
  if (filters.uncategorized === "1") {
    conditions.push(isNull(transaction.categoryId));
  } else if (filters.categoryId) {
    conditions.push(eq(transaction.categoryId, filters.categoryId));
  }
  if (filters.q?.trim()) {
    conditions.push(ilike(transaction.descriptionRaw, `%${filters.q.trim()}%`));
  }

  const txns = await db.query.transaction.findMany({
    where:
      conditions.length > 0
        ? and(...(conditions as [typeof conditions[0], ...typeof conditions]))
        : undefined,
    orderBy: [desc(transaction.startedAt)],
    limit: 200,
    columns: {
      id: true,
      startedAt: true,
      amountNative: true,
      feeNative: true,
      currency: true,
      descriptionRaw: true,
      state: true,
      categoryId: true,
      accountId: true,
    },
  });

  const categoryIds = [...new Set(txns.map((t) => t.categoryId).filter(Boolean) as string[])];
  const txnCategories =
    categoryIds.length > 0
      ? await db.query.category.findMany({
          where: (cat, { inArray }) => inArray(cat.id, categoryIds),
          columns: { id: true, name: true },
        })
      : [];
  const catName = new Map(txnCategories.map((c) => [c.id, c.name]));
  const acctName = new Map(accounts.map((a) => [a.id, a.name]));

  const totalIn = txns.filter((t) => t.amountNative > 0).reduce((s, t) => s + t.amountNative, 0);
  const totalOut = txns.filter((t) => t.amountNative < 0).reduce((s, t) => s + t.amountNative, 0);

  const activeFilterCount = [
    filters.accountId,
    filters.categoryId,
    filters.q?.trim(),
    filters.from,
    filters.to,
    filters.uncategorized === "1" ? "1" : undefined,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6 px-6 py-8">
      <div>
        <h1 className="text-xl font-semibold text-[#F7F4EE]">Transactions</h1>
        <p className="text-[#C4B8A8] mt-1 text-xs">
          {txns.length} rows (max 200){activeFilterCount > 0 ? ` · ${activeFilterCount} filter${activeFilterCount > 1 ? "s" : ""} active` : ""}
        </p>
      </div>

      {/* Filter bar */}
      <form method="GET" className="space-y-2 text-sm">
        <input
          type="search"
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="Search description…"
          className="w-full rounded-md border border-[#4A2E1A] bg-[#3A2414] px-3 py-1.5 text-sm text-[#F7F4EE] placeholder:text-[#6B5040] focus:outline-none focus:ring-1 focus:ring-[#C9A84C]"
        />

        <div className="flex flex-wrap gap-2">
          <select
            name="accountId"
            defaultValue={filters.accountId ?? ""}
            className="rounded-md border border-[#4A2E1A] bg-[#3A2414] px-2 py-1 text-sm text-[#F7F4EE]"
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          <select
            name="categoryId"
            defaultValue={filters.categoryId ?? ""}
            className="rounded-md border border-[#4A2E1A] bg-[#3A2414] px-2 py-1 text-sm text-[#F7F4EE]"
            disabled={filters.uncategorized === "1"}
          >
            <option value="">All categories</option>
            {leafCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <input type="date" name="from" defaultValue={filters.from ?? ""}
            className="rounded-md border border-[#4A2E1A] bg-[#3A2414] px-2 py-1 text-sm text-[#F7F4EE]" />
          <input type="date" name="to" defaultValue={filters.to ?? ""}
            className="rounded-md border border-[#4A2E1A] bg-[#3A2414] px-2 py-1 text-sm text-[#F7F4EE]" />
        </div>

        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[#4A2E1A] bg-[#3A2414] px-2 py-1 text-[#C4B8A8]">
            <input type="checkbox" name="uncategorized" value="1" defaultChecked={filters.uncategorized === "1"} />
            <span>Uncategorized only</span>
          </label>
          <button type="submit" className="rounded-md bg-[#C9A84C] px-3 py-1 text-sm font-medium text-[#2C1A0E]">
            Apply
          </button>
          {activeFilterCount > 0 && (
            <a href="/transactions" className="text-[#C4B8A8] hover:text-[#F7F4EE]">Clear</a>
          )}
        </div>
      </form>

      {/* Summary */}
      <div className="flex gap-6 text-sm">
        <div>
          <p className="text-[#C4B8A8] text-xs">In</p>
          <p className="font-mono font-medium text-[#6BBF85]">{fmt(totalIn)}</p>
        </div>
        <div>
          <p className="text-[#C4B8A8] text-xs">Out</p>
          <p className="font-mono font-medium text-[#E07070]">{fmt(Math.abs(totalOut))}</p>
        </div>
        <div>
          <p className="text-[#C4B8A8] text-xs">Net</p>
          <p className={`font-mono font-medium ${totalIn + totalOut < 0 ? "text-[#E07070]" : "text-[#6BBF85]"}`}>
            {fmt(totalIn + totalOut)}
          </p>
        </div>
      </div>

      {/* Transaction list */}
      {txns.length === 0 ? (
        <p className="text-[#C4B8A8] text-sm">No transactions match these filters.</p>
      ) : (
        <div className="divide-y divide-[#4A2E1A] rounded-xl border border-[#4A2E1A] bg-[#3A2414] text-sm overflow-hidden">
          {txns.map((txn) => (
            <div key={txn.id} className="flex items-center justify-between px-4 py-3 hover:bg-[#4A2E1A] transition-colors">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[#F7F4EE]">{txn.descriptionRaw || "—"}</p>
                <p className="text-[#C4B8A8] mt-0.5 text-xs font-mono">
                  {new Date(txn.startedAt).toLocaleDateString("en-IE")}
                  {!filters.accountId && ` · ${acctName.get(txn.accountId) ?? ""}`}
                  {txn.categoryId ? ` · ${catName.get(txn.categoryId) ?? ""}` : ""}
                  {!txn.categoryId && <span className="text-[#C9A84C]"> · uncategorized</span>}
                  {txn.state !== "completed" && ` · ${txn.state}`}
                </p>
              </div>
              <div className="ml-3 shrink-0 text-right">
                <span className={`font-mono font-medium tabular-nums ${txn.amountNative < 0 ? "text-[#F7F4EE]" : "text-[#6BBF85]"}`}>
                  {fmt(txn.amountNative, txn.currency)}
                </span>
                {txn.feeNative !== 0 && (
                  <p className="text-[#C4B8A8] text-xs">fee {fmt(txn.feeNative, txn.currency)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
