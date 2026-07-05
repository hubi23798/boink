import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { countActiveMemberships, ensureAppUserForAuth } from "@/lib/tenancy/sync-user";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createRouteHandlerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error)
      console.error("[auth/callback] exchangeCodeForSession error:", error.message, error.code);
    if (!error) {
      const { data: userData } = await supabase.auth.getUser();
      const authUser = userData.user;
      if (authUser) {
        const db = getDb();
        await ensureAppUserForAuth(db, authUser.id);
        await supabase.auth.refreshSession();
        const membershipCount = await countActiveMemberships(db, authUser.id);
        if (membershipCount > 1) {
          return NextResponse.redirect(`${origin}/tenants`);
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
