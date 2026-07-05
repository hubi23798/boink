import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireApiAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { account } from "@/lib/db/schema";

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isLiquid: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

interface Context {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, { params }: Context) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();
  const patch = parsed.data;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(account)
    .set(patch)
    .where(and(eq(account.id, id), eq(account.tenantId, tenantId)))
    .returning({ id: account.id });

  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
