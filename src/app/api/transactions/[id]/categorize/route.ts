import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireApiAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { account, transaction } from "@/lib/db/schema";

const bodySchema = z.object({
  categoryId: z.string().uuid(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, { params }: Props) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  const { id } = await params;
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const db = getDb();

  const txn = await db.query.transaction.findFirst({
    where: eq(transaction.id, id),
    columns: { id: true, accountId: true },
  });
  if (!txn) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const acct = await db.query.account.findFirst({
    where: and(eq(account.id, txn.accountId), eq(account.tenantId, tenantId)),
    columns: { id: true },
  });
  if (!acct) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [updated] = await db
    .update(transaction)
    .set({
      categoryId: body.data.categoryId,
      categorizedBy: "manual",
      categorizationRuleId: null,
    })
    .where(eq(transaction.id, id))
    .returning({ id: transaction.id, categoryId: transaction.categoryId });

  return NextResponse.json(updated);
}
