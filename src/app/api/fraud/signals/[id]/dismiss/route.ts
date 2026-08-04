import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/app/lib/require-auth";
import { appendAudit } from "@/lib/audit/append";
import { getDb } from "@/lib/db/client";
import { fraudSignal } from "@/lib/db/schema";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

/**
 * POST /api/fraud/signals/[id]/dismiss — owner dismisses an open signal.
 *
 * Body: `{ reason: string }`. Sets status=dismissed, records actor + reason,
 * audits the transition. Idempotent when already dismissed by the same tenant.
 */
export async function POST(req: Request, ctx: RouteContext) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const db = getDb();
  const row = await db.query.fraudSignal.findFirst({
    where: and(eq(fraudSignal.id, id), eq(fraudSignal.tenantId, auth.ctx.tenantId)),
  });
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (row.status === "dismissed") {
    return NextResponse.json({ ok: true, alreadyDismissed: true });
  }
  if (row.status !== "open" && row.status !== "acknowledged") {
    return NextResponse.json({ error: "not_dismissable", status: row.status }, { status: 409 });
  }

  await db
    .update(fraudSignal)
    .set({
      status: "dismissed",
      dismissedBy: auth.ctx.userId,
      dismissedReason: body.reason,
    })
    .where(eq(fraudSignal.id, row.id));

  await appendAudit(db, {
    tenantId: auth.ctx.tenantId,
    actorUserId: auth.ctx.userId,
    action: "fraud_signal.dismiss",
    targetType: "fraud_signal",
    targetId: row.id,
    before: { status: row.status },
    after: { status: "dismissed", reason: body.reason },
  });

  return NextResponse.json({ ok: true });
}
