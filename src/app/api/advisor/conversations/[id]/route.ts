import { NextResponse } from "next/server";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { requireApiAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import {
  advisorConversation,
  advisorMessage,
  pendingProposal,
} from "@/lib/db/schema";
import { env } from "@/env";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  const db = getDb();
  const { id } = await params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const [conv] = await db
    .select()
    .from(advisorConversation)
    .where(
      and(eq(advisorConversation.id, id), eq(advisorConversation.tenantId, tenantId)),
    )
    .limit(1);

  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await db
    .update(pendingProposal)
    .set({ status: "expired", resolvedAt: new Date() })
    .where(
      and(
        eq(pendingProposal.status, "pending"),
        lt(pendingProposal.createdAt, sevenDaysAgo),
      ),
    );

  const messages = await db.query.advisorMessage.findMany({
    where: eq(advisorMessage.conversationId, id),
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });

  const messageIds = messages.map((m) => m.id);
  let proposals: (typeof pendingProposal.$inferSelect)[] = [];
  if (messageIds.length > 0) {
    proposals = await db.query.pendingProposal.findMany({
      where: (pp, { inArray }) => inArray(pp.advisorMessageId, messageIds),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    });
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const [usageRow] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${advisorMessage.inputTokens} + ${advisorMessage.outputTokens}), 0)`,
    })
    .from(advisorMessage)
    .where(gte(advisorMessage.createdAt, todayStart));

  return NextResponse.json({
    conversation: conv,
    messages,
    proposals,
    todayTokens: parseInt(usageRow?.total ?? "0", 10),
    tokenBudget: env().ADVISOR_DAILY_TOKEN_BUDGET,
  });
}
