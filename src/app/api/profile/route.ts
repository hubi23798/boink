import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireApiAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { user } from "@/lib/db/schema";

const patchSchema = z.object({
  baseCurrency: z.string().length(3).optional(),
  locale: z.string().min(2).max(10).optional(),
  birthYear: z.number().int().min(1900).max(2100).nullable().optional(),
  timeHorizonYears: z.number().int().min(1).max(60).nullable().optional(),
  riskTolerance: z.enum(["conservative", "moderate", "aggressive"]).nullable().optional(),
});

export async function PATCH(req: Request) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;
  const { userId } = auth.ctx;

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();
  await db.update(user).set(parsed.data).where(eq(user.id, userId));

  return NextResponse.json({ ok: true });
}
