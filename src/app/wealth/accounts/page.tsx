import { requirePageAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { getNetWorthNow } from "@/lib/net-worth/engine";

export default async function AccountsPage() {
  const { tenantId } = await requirePageAuth();

  const db = getDb();
  const nw = await getNetWorthNow(db, tenantId);

  function fmt(minor: number, currency = "EUR") {
    return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(minor / 100);
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <a href="/wealth" className="text-fg-muted text-sm hover:underline">
          ← Wealth
        </a>
        <h1 className="mt-2 text-xl font-semibold">Accounts</h1>
        <p className="text-fg-muted mt-1 text-sm">{nw.accounts.length} accounts</p>
      </div>

      <div className="divide-border-subtle divide-y rounded-lg border text-sm">
        {nw.accounts.map((acct) => (
          <a
            key={acct.id}
            href={`/wealth/accounts/${acct.id}`}
            className="flex items-center justify-between p-3 hover:bg-black/5 dark:hover:bg-white/5"
          >
            <div className="space-y-0.5">
              <p className="font-medium">{acct.name}</p>
              <p className="text-fg-muted text-xs">
                {acct.currency} · {acct.kind}
                {acct.isLiquid ? " · liquid" : ""}
              </p>
            </div>
            <div className="text-right">
              <p
                className={
                  acct.balanceNative < 0
                    ? "font-medium text-red-600 dark:text-red-400"
                    : "font-medium"
                }
              >
                {fmt(acct.balanceNative, acct.currency)}
              </p>
              {acct.currency !== "EUR" && (
                <p className="text-fg-muted text-xs">{fmt(acct.balanceBaseCcy)}</p>
              )}
            </div>
          </a>
        ))}
      </div>
    </main>
  );
}
