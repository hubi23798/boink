import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { recurringDismissal } from "@/lib/db/schema";

const bodySchema = z.object({ key: z.string().min(1).max(512) });

export async function POST(req: Request) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

  const db = getDb();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  await db
    .insert(recurringDismissal)
    .values({ tenantId, userId, key: parsed.data.key })
    .onConflictDoNothing();

  return NextResponse.json({ ok: true }, { status: 201 });
}
