import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { requirePageAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { account, connection } from "@/lib/db/schema";
import { ConnectionsClient, type ConnectionRow } from "./connections-client";

export const metadata: Metadata = { title: "Connections · truffe.ai" };

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { tenantId } = await requirePageAuth();
  const { connected, error } = await searchParams;

  const db = getDb();
  const [connections, accounts] = await Promise.all([
    db.query.connection.findMany({
      where: eq(connection.tenantId, tenantId),
      orderBy: [desc(connection.createdAt)],
    }),
    db.query.account.findMany({
      where: eq(account.tenantId, tenantId),
      columns: { externalProvider: true },
    }),
  ]);

  // Accounts have no connection_id FK — they link to a connection only by
  // externalProvider. Count is therefore per-provider (exact for the common
  // one-connection-per-provider case).
  const accountCountByProvider = new Map<string, number>();
  for (const a of accounts) {
    if (!a.externalProvider) continue;
    accountCountByProvider.set(
      a.externalProvider,
      (accountCountByProvider.get(a.externalProvider) ?? 0) + 1,
    );
  }

  const rows: ConnectionRow[] = connections.map((c) => ({
    id: c.id,
    provider: c.provider,
    status: c.status,
    lastSyncedAt: c.lastSyncedAt ? c.lastSyncedAt.toISOString() : null,
    lastError: c.lastError,
    accountCount: accountCountByProvider.get(c.provider) ?? 0,
  }));

  return (
    <ConnectionsClient connections={rows} connected={connected ?? null} error={error ?? null} />
  );
}
