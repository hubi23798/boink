import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { connection } from "@/lib/db/schema";

const MIN_MANUAL_RESYNC_INTERVAL_MS = 15 * 60 * 1000;

export async function assertManualResyncRateLimit(db: Db, connectionId: string): Promise<void> {
  const row = await db.query.connection.findFirst({
    where: eq(connection.id, connectionId),
    columns: { lastSyncedAt: true },
  });
  if (!row?.lastSyncedAt) return;
  const elapsed = Date.now() - row.lastSyncedAt.getTime();
  if (elapsed < MIN_MANUAL_RESYNC_INTERVAL_MS) {
    throw new Error("resync_rate_limit");
  }
}

export async function listActiveConnections(db: Db) {
  return db
    .select({ id: connection.id })
    .from(connection)
    .where(and(eq(connection.status, "active")));
}
