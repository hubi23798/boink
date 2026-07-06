import { and, eq, gte } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { connection } from "@/lib/db/schema";

const MAX_NEW_CONNECTIONS_PER_HOUR = 3;

export async function countRecentConnections(db: Db, tenantId: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const rows = await db
    .select({ id: connection.id })
    .from(connection)
    .where(and(eq(connection.tenantId, tenantId), gte(connection.createdAt, since)));
  return rows.length;
}

export async function assertConnectionRateLimit(db: Db, tenantId: string): Promise<void> {
  const count = await countRecentConnections(db, tenantId);
  if (count >= MAX_NEW_CONNECTIONS_PER_HOUR) {
    throw new Error("connection_rate_limit");
  }
}
