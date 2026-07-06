import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireApiAuth } from "@/app/lib/require-auth";
import { deleteToken } from "@/lib/aggregators/vault";
import { appendAudit } from "@/lib/audit/append";
import { getDb } from "@/lib/db/client";
import { connection } from "@/lib/db/schema";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/connections/[id] — revoke a connection.
 *
 * Marks the connection revoked first (so the sync runner refuses it), then
 * best-effort deletes the Vault-stored OAuth token, then audit-logs. Idempotent:
 * revoking an already-revoked connection is a no-op success.
 */
export async function DELETE(req: Request, ctx: RouteContext) {
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
    return NextResponse.json({ ok: true, alreadyRevoked: true });
  }

  // Stop the sync runner from using this connection before touching the token.
  await db
    .update(connection)
    .set({ status: "revoked", lastError: null, updatedAt: new Date() })
    .where(eq(connection.id, conn.id));

  // Best-effort token teardown. The connection is already revoked, so a failed
  // delete cannot be used for further syncs — log and continue rather than
  // leaving the connection in a half-revoked state.
  try {
    await deleteToken(conn.accessTokenRef);
  } catch (e) {
    console.error("[connections/revoke] vault token delete failed", conn.id, e);
  }

  await appendAudit(db, {
    tenantId: auth.ctx.tenantId,
    actorUserId: auth.ctx.userId,
    action: "connection.revoke",
    targetType: "connection",
    targetId: conn.id,
    before: { status: conn.status },
    after: { status: "revoked" },
  });

  return NextResponse.json({ ok: true });
}
