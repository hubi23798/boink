import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object" || !("email" in body)) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }
  const { email } = body as { email: string };
  const supabase = await createRouteHandlerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${new URL(req.url).origin}/auth/callback` },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
