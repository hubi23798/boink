import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { countActiveMemberships, ensureAppUserForAuth } from "@/lib/tenancy/sync-user";

/** Provision public.user + tenant_member after Supabase Auth sign-in (passkey or OTP). */
export async function POST() {
  const supabase = await createRouteHandlerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const db = getDb();
  await ensureAppUserForAuth(db, userData.user.id);
  await supabase.auth.refreshSession();

  const membershipCount = await countActiveMemberships(db, userData.user.id);
  const redirectTo = membershipCount > 1 ? "/tenants" : "/";

  return NextResponse.json({ ok: true, redirectTo, membershipCount });
}
