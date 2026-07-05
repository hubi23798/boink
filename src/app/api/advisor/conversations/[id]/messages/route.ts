import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireApiAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { advisorConversation, advisorMessage } from "@/lib/db/schema";
import { runAdvisorTurn } from "@/lib/advisor/engine";

const bodySchema = z.object({
  message: z.string().min(1).max(4000),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

  const db = getDb();
  const { id } = await params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const [conv] = await db
    .select({ id: advisorConversation.id, title: advisorConversation.title })
    .from(advisorConversation)
    .where(and(eq(advisorConversation.id, id), eq(advisorConversation.tenantId, tenantId)))
    .limit(1);

  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const [firstCheck] = await db
    .select({ id: advisorMessage.id })
    .from(advisorMessage)
    .where(eq(advisorMessage.conversationId, id))
    .limit(1);
  const isFirst = !firstCheck;

  let result;
  try {
    result = await runAdvisorTurn(db, tenantId, userId, id, parsed.data.message);
  } catch (err) {
    console.error("[advisor] runAdvisorTurn failed:", err);
    return NextResponse.json({ error: "Advisor unavailable. Please try again." }, { status: 500 });
  }

  if (isFirst) {
    await db
      .update(advisorConversation)
      .set({ title: parsed.data.message.slice(0, 60) })
      .where(eq(advisorConversation.id, id));
  }

  return NextResponse.json(result);
}
