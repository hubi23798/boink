import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireApiAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { categorizationRule } from "@/lib/db/schema";

interface Props {
  params: Promise<{ id: string }>;
}

export async function DELETE(_req: Request, { params }: Props) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  const { id } = await params;
  const db = getDb();
  const [deleted] = await db
    .delete(categorizationRule)
    .where(and(eq(categorizationRule.id, id), eq(categorizationRule.tenantId, tenantId)))
    .returning({ id: categorizationRule.id });

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new Response(null, { status: 204 });
}
