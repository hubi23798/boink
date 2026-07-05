import { createServerClient } from "@/lib/supabase/server";

function decodeActiveTenantId(token: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")) as {
      active_tenant_id?: string;
    };
    return payload.active_tenant_id;
  } catch {
    return undefined;
  }
}

async function tenantIdFromSupabaseSession(): Promise<string | undefined> {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return undefined;
  return decodeActiveTenantId(token);
}

export async function resolveTenantId(req: Request): Promise<string> {
  const headerClaims = req.headers.get("x-supabase-jwt-claims");
  if (headerClaims) {
    const claims = JSON.parse(headerClaims) as { active_tenant_id?: string };
    if (claims.active_tenant_id) return claims.active_tenant_id;
  }
  const fromSession = await tenantIdFromSupabaseSession();
  if (fromSession) return fromSession;
  throw new Error("active_tenant_id missing from session");
}

export async function resolveTenantIdFromSession(): Promise<string> {
  const fromSession = await tenantIdFromSupabaseSession();
  if (fromSession) return fromSession;
  throw new Error("active_tenant_id missing from session");
}
