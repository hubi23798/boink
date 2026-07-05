import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireApiAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { account, goal } from "@/lib/db/schema";
import { getLatestBalances } from "@/lib/goals/balance";
import { UUID_RE } from "@/lib/validation/uuid";

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  targetAmount: z.number().int().positive().optional(),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  linkedAccountIds: z.array(z.string().regex(UUID_RE)).min(1).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  const db = getDb();
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const existing = await db.query.goal.findFirst({
    where: (g, { and, eq }) => and(eq(g.id, id), eq(g.tenantId, tenantId), eq(g.isArchived, false)),
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.data.linkedAccountIds) {
    const ownedAccounts = await db
      .select({ id: account.id })
      .from(account)
      .where(eq(account.tenantId, tenantId));
    const ownedIds = new Set(ownedAccounts.map((a) => a.id));
    if (!parsed.data.linkedAccountIds.every((aid) => ownedIds.has(aid))) {
      return NextResponse.json({ error: "Invalid account" }, { status: 400 });
    }
  }

  let newInitialBalance: number | undefined;
  if (existing.kind === "debt_payoff" && parsed.data.linkedAccountIds !== undefined) {
    const balances = await getLatestBalances(db, parsed.data.linkedAccountIds);
    newInitialBalance = parsed.data.linkedAccountIds.reduce(
      (s, aid) => s + (balances.get(aid) ?? 0),
      0,
    );
  }

  const now = new Date();
  const [updated] = await db
    .update(goal)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.targetAmount !== undefined ? { targetAmount: parsed.data.targetAmount } : {}),
      ...("targetDate" in parsed.data ? { targetDate: parsed.data.targetDate ?? null } : {}),
      ...(parsed.data.linkedAccountIds !== undefined
        ? { linkedAccountIds: parsed.data.linkedAccountIds }
        : {}),
      ...(newInitialBalance !== undefined ? { initialBalance: newInitialBalance } : {}),
      updatedAt: now,
    })
    .where(and(eq(goal.id, id), eq(goal.tenantId, tenantId)))
    .returning();

  if (!updated) return NextResponse.json({ error: "Internal error" }, { status: 500 });

  return NextResponse.json({ goal: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  const db = getDb();
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [archived] = await db
    .update(goal)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(and(eq(goal.id, id), eq(goal.tenantId, tenantId)))
    .returning({ id: goal.id });

  if (!archived) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
