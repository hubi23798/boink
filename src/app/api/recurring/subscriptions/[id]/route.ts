import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireApiAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { budgetTarget, category, recurringSubscription } from "@/lib/db/schema";
import { computeBudgetProposal } from "@/lib/recurring/budget-proposal";

function toMonthlyAbs(absAmount: number, frequency: "weekly" | "fortnightly" | "monthly"): number {
  if (frequency === "weekly") return Math.round((absAmount * 52) / 12);
  if (frequency === "fortnightly") return Math.round((absAmount * 26) / 12);
  return absAmount;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  frequency: z.enum(["weekly", "fortnightly", "monthly"]).optional(),
  amountNative: z
    .number()
    .int()
    .refine((n) => n !== 0, { message: "amountNative cannot be zero" })
    .optional(),
  currency: z.string().length(3).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  nextDue: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

  const db = getDb();
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const existing = await db.query.recurringSubscription.findFirst({
    where: and(eq(recurringSubscription.id, id), eq(recurringSubscription.tenantId, tenantId)),
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();
  const [sub] = await db
    .update(recurringSubscription)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.frequency !== undefined ? { frequency: parsed.data.frequency } : {}),
      ...(parsed.data.amountNative !== undefined ? { amountNative: parsed.data.amountNative } : {}),
      ...(parsed.data.currency !== undefined ? { currency: parsed.data.currency } : {}),
      ...("categoryId" in parsed.data ? { categoryId: parsed.data.categoryId ?? null } : {}),
      ...("nextDue" in parsed.data ? { nextDue: parsed.data.nextDue ?? null } : {}),
      updatedAt: now,
    })
    .where(and(eq(recurringSubscription.id, id), eq(recurringSubscription.tenantId, tenantId)))
    .returning();

  if (!sub) return NextResponse.json({ error: "Internal error" }, { status: 500 });

  const newCategoryId = sub.categoryId;
  const categoryOrAmountChanged =
    "categoryId" in parsed.data || parsed.data.amountNative !== undefined;

  if (!newCategoryId || !categoryOrAmountChanged) {
    return NextResponse.json({ subscription: sub });
  }

  const [existingRow] = await db
    .select({ amountMonthly: budgetTarget.amountMonthly })
    .from(budgetTarget)
    .where(and(eq(budgetTarget.tenantId, tenantId), eq(budgetTarget.categoryId, newCategoryId)));

  const monthlyAmount = toMonthlyAbs(Math.abs(sub.amountNative), sub.frequency);
  const proposal = computeBudgetProposal(
    newCategoryId,
    monthlyAmount,
    existingRow?.amountMonthly ?? null,
  );

  if (proposal.action === "create") {
    await db.insert(budgetTarget).values({
      tenantId,
      userId,
      categoryId: newCategoryId,
      amountMonthly: proposal.amount,
      updatedAt: now,
    });
    return NextResponse.json({ subscription: sub, budgetCreated: true });
  }

  if (proposal.action === "conflict") {
    const [cat] = await db
      .select({ name: category.name })
      .from(category)
      .where(eq(category.id, newCategoryId));
    return NextResponse.json({
      subscription: sub,
      budgetConflict: {
        existingAmount: proposal.existingAmount,
        proposedAmount: proposal.proposedAmount,
        categoryName: cat?.name ?? newCategoryId,
      },
    });
  }

  return NextResponse.json({ subscription: sub });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  const db = getDb();
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const deleted = await db
    .delete(recurringSubscription)
    .where(and(eq(recurringSubscription.id, id), eq(recurringSubscription.tenantId, tenantId)))
    .returning({ id: recurringSubscription.id });

  if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
