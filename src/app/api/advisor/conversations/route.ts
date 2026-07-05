import { NextResponse } from "next/server";
import { count, desc, eq } from "drizzle-orm";
import { requireApiAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { advisorConversation, advisorMessage } from "@/lib/db/schema";

export async function GET() {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  const db = getDb();
  const rows = await db
    .select({
      id: advisorConversation.id,
      title: advisorConversation.title,
      startedAt: advisorConversation.startedAt,
      isArchived: advisorConversation.isArchived,
      messageCount: count(advisorMessage.id),
    })
    .from(advisorConversation)
    .leftJoin(advisorMessage, eq(advisorMessage.conversationId, advisorConversation.id))
    .where(eq(advisorConversation.tenantId, tenantId))
    .groupBy(
      advisorConversation.id,
      advisorConversation.title,
      advisorConversation.startedAt,
      advisorConversation.isArchived,
    )
    .orderBy(desc(advisorConversation.startedAt));

  return NextResponse.json({ conversations: rows });
}

export async function POST() {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

  const db = getDb();
  const [conv] = await db
    .insert(advisorConversation)
    .values({ tenantId, userId, title: "New conversation" })
    .returning({ id: advisorConversation.id });

  return NextResponse.json({ id: conv!.id }, { status: 201 });
}
