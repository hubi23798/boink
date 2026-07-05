import { NextResponse } from "next/server";
import { asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireApiAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { category } from "@/lib/db/schema";

export async function GET() {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  const db = getDb();
  const rows = await db.query.category.findMany({
    where: eq(category.tenantId, tenantId),
    orderBy: [isNull(category.parentId), asc(category.name)],
  });

  return NextResponse.json(rows);
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().uuid().nullable().optional(),
  kind: z.enum(["income", "expense", "transfer", "investment_flow"]),
});

export async function POST(req: Request) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

  const body = createSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const db = getDb();
  const [row] = await db
    .insert(category)
    .values({
      tenantId,
      userId,
      name: body.data.name,
      parentId: body.data.parentId ?? null,
      kind: body.data.kind,
    })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
