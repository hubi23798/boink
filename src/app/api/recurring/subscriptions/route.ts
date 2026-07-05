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

const bodySchema = z.object({
  detectionKey: z.string().optional(),
  name: z.string().min(1).max(200),
  frequency: z.enum(["weekly", "fortnightly", "monthly"]),
  amountNative: z
    .number()
    .int()
    .refine((n) => n !== 0, { message: "amountNative cannot be zero" }),
  currency: z.string().length(3),
  categoryId: z.string().uuid().optional(),
  nextDue: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export async function POST(req: Request) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

  const db = getDb();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { detectionKey, name, frequency, amountNative, currency, categoryId, nextDue } =
    parsed.data;

  const now = new Date();
  const [sub] = await db
    .insert(recurringSubscription)
    .values({
      tenantId,
      userId,
      detectionKey: detectionKey ?? null,
      name,
      frequency,
      amountNative,
      currency,
      categoryId: categoryId ?? null,
      nextDue: nextDue ?? null,
      updatedAt: now,
    })
    .returning();

  if (!sub) return NextResponse.json({ error: "Internal error" }, { status: 500 });

  if (!categoryId) {
    return NextResponse.json({ subscription: sub }, { status: 201 });
  }

  const [existingRow] = await db
    .select({ amountMonthly: budgetTarget.amountMonthly })
    .from(budgetTarget)
    .where(and(eq(budgetTarget.tenantId, tenantId), eq(budgetTarget.categoryId, categoryId)));

  const monthlyAmount = toMonthlyAbs(Math.abs(amountNative), frequency);
  const proposal = computeBudgetProposal(
    categoryId,
    monthlyAmount,
    existingRow?.amountMonthly ?? null,
  );

  if (proposal.action === "create") {
    await db.insert(budgetTarget).values({
      tenantId,
      userId,
      categoryId,
      amountMonthly: proposal.amount,
      updatedAt: now,
    });
    return NextResponse.json({ subscription: sub, budgetCreated: true }, { status: 201 });
  }

  if (proposal.action === "conflict") {
    const [cat] = await db
      .select({ name: category.name })
      .from(category)
      .where(eq(category.id, categoryId));
    return NextResponse.json(
      {
        subscription: sub,
        budgetConflict: {
          existingAmount: proposal.existingAmount,
          proposedAmount: proposal.proposedAmount,
          categoryName: cat?.name ?? categoryId,
        },
      },
      { status: 201 },
    );
  }

  return NextResponse.json({ subscription: sub }, { status: 201 });
}
