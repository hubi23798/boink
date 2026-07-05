import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface HookPayload {
  user_id: string;
  claims: Record<string, unknown>;
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  let payload: HookPayload;
  try {
    payload = (await req.json()) as HookPayload;
  } catch {
    return new Response(JSON.stringify({ error: "invalid body" }), { status: 400 });
  }

  if (!payload.user_id || typeof payload.user_id !== "string") {
    return new Response(JSON.stringify({ error: "missing user_id" }), { status: 400 });
  }

  try {
    const { data, error: userErr } = await admin
      .from("user")
      .select("default_tenant_id")
      .eq("id", payload.user_id)
      .maybeSingle();

    let activeTenantId: string | null = null;

    if (!userErr) {
      activeTenantId = data?.default_tenant_id ?? null;
    }

    if (!activeTenantId) {
      const { data: membership, error: memberErr } = await admin
        .from("tenant_member")
        .select("tenant_id")
        .eq("user_id", payload.user_id)
        .is("revoked_at", null)
        .order("invited_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!memberErr) {
        activeTenantId = membership?.tenant_id ?? null;
      }
    }

    return new Response(
      JSON.stringify({
        claims: { ...payload.claims, active_tenant_id: activeTenantId },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch {
    // On any unexpected error, pass claims through unchanged so login is never denied.
    return new Response(JSON.stringify({ claims: payload.claims }), {
      headers: { "Content-Type": "application/json" },
    });
  }
});
