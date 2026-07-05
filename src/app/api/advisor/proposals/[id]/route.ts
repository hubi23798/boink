import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireApiAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import {
  advisorConversation,
  advisorMessage,
  auditLog,
  categorizationRule,
  pendingProposal,
} from "@/lib/db/schema";

const bodySchema = z.object({
  action: z.enum(["accept", "reject"]),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

  const db = getDb();
  const { id } = await params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const [proposal] = await db
    .select({
      id: pendingProposal.id,
      status: pendingProposal.status,
      kind: pendingProposal.kind,
      payload: pendingProposal.payload,
      advisorMessageId: pendingProposal.advisorMessageId,
    })
    .from(pendingProposal)
    .innerJoin(advisorMessage, eq(pendingProposal.advisorMessageId, advisorMessage.id))
    .innerJoin(advisorConversation, eq(advisorMessage.conversationId, advisorConversation.id))
    .where(and(eq(pendingProposal.id, id), eq(advisorConversation.tenantId, tenantId)))
    .limit(1);

  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (proposal.status !== "pending")
    return NextResponse.json({ error: "Proposal is not pending" }, { status: 422 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const now = new Date();
  const action = parsed.data.action;

  if (action === "accept" && proposal.kind === "create_rule") {
    const p = proposal.payload as {
      matchKind:
        | "description_contains"
        | "description_regex"
        | "type_raw_equals"
        | "amount_range"
        | "account_id_equals";
      matchValue: string;
      categoryId: string;
    };

    const existing = await db.query.categorizationRule.findMany({
      where: eq(categorizationRule.tenantId, tenantId),
      columns: { priority: true },
      orderBy: (t, { desc: d }) => [d(t.priority)],
    });
    const nextPriority = (existing[0]?.priority ?? 0) + 1;

    await db.insert(categorizationRule).values({
      tenantId,
      userId,
      priority: nextPriority,
      matchKind: p.matchKind,
      matchValue: p.matchValue,
      categoryId: p.categoryId,
      source: "llm_accepted",
    });

    await db.insert(auditLog).values({
      userId,
      actor: "user",
      action: "accept_proposal",
      targetTable: "categorization_rule",
      advisorMessageId: proposal.advisorMessageId,
      after: proposal.payload as Record<string, unknown>,
    });
  } else if (action === "reject") {
    await db.insert(auditLog).values({
      userId,
      actor: "user",
      action: "reject_proposal",
      targetTable: "pending_proposal",
      targetId: id,
      advisorMessageId: proposal.advisorMessageId,
    });
  }

  await db
    .update(pendingProposal)
    .set({ status: action === "accept" ? "accepted" : "rejected", resolvedAt: now })
    .where(eq(pendingProposal.id, id));

  return NextResponse.json({ ok: true });
}
