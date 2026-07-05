import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireApiAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { categorizationRule } from "@/lib/db/schema";

export async function GET() {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  const db = getDb();
  const rows = await db.query.categorizationRule.findMany({
    where: eq(categorizationRule.tenantId, tenantId),
    orderBy: [asc(categorizationRule.priority)],
  });

  return NextResponse.json(rows);
}

const createSchema = z.object({
  priority: z.number().int().min(0),
  matchKind: z.enum([
    "description_contains",
    "description_regex",
    "type_raw_equals",
    "amount_range",
    "account_id_equals",
  ]),
  matchValue: z.string().min(1),
  categoryId: z.string().uuid(),
});

export async function POST(req: Request) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

  const body = createSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const db = getDb();
  const [row] = await db
    .insert(categorizationRule)
    .values({ tenantId, userId, source: "user", ...body.data })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
