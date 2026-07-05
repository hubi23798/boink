import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { CategoryPicker } from "@/components/category-picker";
import { requirePageAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { category, transaction } from "@/lib/db/schema";

export default async function InboxPage() {
  const { tenantId } = await requirePageAuth();

  const db = getDb();

  const [uncategorized, categories] = await Promise.all([
    db.query.transaction.findMany({
      where: and(eq(transaction.tenantId, tenantId), isNull(transaction.categoryId)),
      orderBy: [desc(transaction.startedAt)],
      limit: 100,
      columns: {
        id: true,
        startedAt: true,
        amountNative: true,
        currency: true,
        descriptionRaw: true,
        typeRaw: true,
        state: true,
      },
    }),
    db.query.category.findMany({
      where: eq(category.tenantId, tenantId),
      orderBy: [asc(category.name)],
      columns: { id: true, name: true, parentId: true },
    }),
  ]);

  function formatAmount(minor: number, currency: string) {
    return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(minor / 100);
  }

  return (
    <div className="space-y-6 px-6 py-8">
      <div>
        <h1 className="text-xl font-semibold text-[#F7F4EE]">Transactions inbox</h1>
        <p className="text-[#C4B8A8] mt-1 text-sm">
          {uncategorized.length} uncategorized transaction{uncategorized.length !== 1 ? "s" : ""}
        </p>
      </div>

      {uncategorized.length === 0 ? (
        <p className="text-[#C4B8A8] text-sm">All transactions are categorized.</p>
      ) : (
        <div className="divide-y divide-[#4A2E1A] rounded-xl border border-[#4A2E1A] bg-[#3A2414] text-sm overflow-hidden">
          {uncategorized.map((txn) => (
            <div key={txn.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between hover:bg-[#4A2E1A] transition-colors">
              <div className="min-w-0">
                <p className="truncate font-medium text-[#F7F4EE]">{txn.descriptionRaw || txn.typeRaw || "—"}</p>
                <p className="text-[#C4B8A8] text-xs font-mono">
                  {new Date(txn.startedAt).toLocaleDateString()} · {txn.state}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <span className={`font-mono font-medium tabular-nums ${txn.amountNative < 0 ? "text-[#F7F4EE]" : "text-[#6BBF85]"}`}>
                  {formatAmount(txn.amountNative, txn.currency)}
                </span>
                <CategoryPicker
                  transactionId={txn.id}
                  categories={categories}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
