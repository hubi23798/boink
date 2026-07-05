import { eq } from "drizzle-orm";
import { requirePageAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { account } from "@/lib/db/schema";
import { AccountRow } from "./account-row";

export default async function SettingsAccountsPage() {
  const { tenantId } = await requirePageAuth();

  const db = getDb();
  const accounts = await db.query.account.findMany({
    where: eq(account.tenantId, tenantId),
    orderBy: (a, { asc }) => [asc(a.name)],
  });

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <a href="/settings" className="text-fg-muted text-sm hover:underline">← Settings</a>
        <h1 className="mt-2 text-xl font-semibold">Accounts</h1>
        <p className="text-fg-muted mt-1 text-xs">
          {accounts.length} accounts · {accounts.filter((a) => !a.isActive).length} archived
        </p>
      </div>

      <div className="divide-border-subtle divide-y rounded-lg border text-sm">
        {accounts.map((acct) => (
          <AccountRow key={acct.id} account={acct} />
        ))}
      </div>
    </main>
  );
}
