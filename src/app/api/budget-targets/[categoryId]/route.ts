import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireApiAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { budgetTarget, category } from "@/lib/db/schema";

const putBody = z.object({
  amountMonthly: z.number().int().positive(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ categoryId: string }> },
) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

  const db = getDb();
  const { categoryId } = await params;

  const cat = await db.query.category.findFirst({
    where: and(eq(category.id, categoryId), eq(category.tenantId, tenantId)),
  });
  if (!cat) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!cat.parentId)
    return NextResponse.json({ error: "Targets can only be set on leaf categories" }, { status: 422 });
  if (cat.kind !== "expense" && cat.kind !== "investment_flow")
    return NextResponse.json(
      { error: "Targets can only be set on expense or investment_flow categories" },
      { status: 422 },
    );

  const parsed = putBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const now = new Date();
  const [row] = await db
    .insert(budgetTarget)
    .values({
      tenantId,
      userId,
      categoryId,
      amountMonthly: parsed.data.amountMonthly,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [budgetTarget.userId, budgetTarget.categoryId],
      set: { amountMonthly: parsed.data.amountMonthly, updatedAt: now },
    })
    .returning();

  return NextResponse.json({ id: row!.id, categoryId, amountMonthly: row!.amountMonthly });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ categoryId: string }> },
) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  const db = getDb();
  const { categoryId } = await params;

  await db
    .delete(budgetTarget)
    .where(and(eq(budgetTarget.tenantId, tenantId), eq(budgetTarget.categoryId, categoryId)));

  return NextResponse.json({ ok: true });
}
