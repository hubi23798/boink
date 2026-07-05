import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getAuthContext, type AuthContext } from "@/lib/auth/guard";

export type { AuthContext };

export async function requirePageAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  return ctx;
}

export async function requireApiAuth(
  req?: Request,
): Promise<{ ok: true; ctx: AuthContext } | { ok: false; response: NextResponse }> {
  const ctx = await getAuthContext(req);
  if (!ctx) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    };
  }
  return { ok: true, ctx };
}
