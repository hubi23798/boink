import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireApiAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { fraudSignal } from "@/lib/db/schema";

/**
 * GET /api/fraud/signals — list fraud signals for the active tenant.
 * Optional query: `?status=open|dismissed|acknowledged|escalated` (default: open).
 */
export async function GET(req: Request) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status") ?? "open";
  const allowed = new Set(["open", "dismissed", "acknowledged", "escalated", "all"]);
  if (!allowed.has(statusParam)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const db = getDb();
  const where =
    statusParam === "all"
      ? eq(fraudSignal.tenantId, auth.ctx.tenantId)
      : and(
          eq(fraudSignal.tenantId, auth.ctx.tenantId),
          eq(
            fraudSignal.status,
            statusParam as "open" | "dismissed" | "acknowledged" | "escalated",
          ),
        );

  const rows = await db
    .select({
      id: fraudSignal.id,
      detectorId: fraudSignal.detectorId,
      transactionId: fraudSignal.transactionId,
      severity: fraudSignal.severity,
      evidence: fraudSignal.evidence,
      suggestedAction: fraudSignal.suggestedAction,
      status: fraudSignal.status,
      dismissedBy: fraudSignal.dismissedBy,
      dismissedReason: fraudSignal.dismissedReason,
      createdAt: fraudSignal.createdAt,
      expiresAt: fraudSignal.expiresAt,
    })
    .from(fraudSignal)
    .where(where)
    .orderBy(desc(fraudSignal.createdAt))
    .limit(100);

  return NextResponse.json({ signals: rows });
}
