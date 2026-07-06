import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireApiAuth } from "@/app/lib/require-auth";
import { assertManualResyncRateLimit } from "@/lib/aggregators/sync-schedule";
import { syncConnection } from "@/lib/aggregators/truelayer/sync";
import { getDb } from "@/lib/db/client";
import { connection } from "@/lib/db/schema";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/connections/[id]/resync — owner-triggered sync (max 1 / 15 min). */
export async function POST(req: Request, ctx: RouteContext) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const db = getDb();
  const conn = await db.query.connection.findFirst({
    where: and(eq(connection.id, id), eq(connection.tenantId, auth.ctx.tenantId)),
  });
  if (!conn) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (conn.status === "revoked") {
    return NextResponse.json({ error: "connection_revoked" }, { status: 409 });
  }

  try {
    await assertManualResyncRateLimit(db, id);
  } catch (e) {
    if (e instanceof Error && e.message === "resync_rate_limit") {
      return NextResponse.json(
        { error: "rate_limit", message: "Max 1 manual resync per 15 minutes" },
        { status: 429 },
      );
    }
    throw e;
  }

  try {
    const result = await syncConnection(db, id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "sync_failed";
    return NextResponse.json({ error: "sync_failed", message }, { status: 502 });
  }
}
