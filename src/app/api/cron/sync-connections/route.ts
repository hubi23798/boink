import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { getDb } from "@/lib/db/client";
import { listActiveConnections } from "@/lib/aggregators/sync-schedule";
import { syncConnection } from "@/lib/aggregators/truelayer/sync";

/** POST /api/cron/sync-connections — sync all active aggregator connections (6h). */
export async function POST(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  process.env.CRON_CONTEXT = "1";
  const db = getDb();
  const rows = await listActiveConnections(db);
  const results: {
    connectionId: string;
    ok: boolean;
    error?: string;
    accountsUpserted?: number;
    transactionsImported?: number;
  }[] = [];

  for (const row of rows) {
    try {
      const result = await syncConnection(db, row.id);
      results.push({
        connectionId: row.id,
        ok: true,
        accountsUpserted: result.accountsUpserted,
        transactionsImported: result.transactionsImported,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "sync_failed";
      console.error("[cron/sync-connections]", row.id, message);
      results.push({ connectionId: row.id, ok: false, error: message });
    }
  }

  return NextResponse.json({
    ok: true,
    synced: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
