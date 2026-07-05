import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireApiAuth } from "@/app/lib/require-auth";
import { destroySession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { session } from "@/lib/db/schema";

interface Context {
  params: Promise<{ id: string }>;
}

export async function DELETE(req: Request, { params }: Context) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;
  const { userId } = auth.ctx;

  const { id } = await params;
  const db = getDb();

  const target = await db.query.session.findFirst({
    where: and(eq(session.id, id), eq(session.userId, userId)),
    columns: { id: true },
  });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  await destroySession(db, id);
  return NextResponse.json({ ok: true });
}
