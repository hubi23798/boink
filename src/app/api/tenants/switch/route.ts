import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { tenantMember, user } from "@/lib/db/schema";

export async function POST(req: Request) {
  const form = await req.formData();
  const tenantId = String(form.get("tenantId") ?? "");
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId required" }, { status: 400 });
  }

  const supabase = await createRouteHandlerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const db = getDb();
  const membership = await db.query.tenantMember.findFirst({
    where: and(
      eq(tenantMember.userId, userData.user.id),
      eq(tenantMember.tenantId, tenantId),
      isNull(tenantMember.revokedAt),
    ),
  });
  if (!membership) {
    return NextResponse.json({ error: "no membership" }, { status: 403 });
  }

  await db.update(user).set({ defaultTenantId: tenantId }).where(eq(user.id, userData.user.id));

  await supabase.auth.refreshSession();
  return NextResponse.redirect(new URL("/", req.url));
}
