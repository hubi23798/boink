import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { PRIMARY_TENANT_ID, tenantMember, user } from "@/lib/db/schema";
import { resolveTenantId, resolveTenantIdFromSession } from "@/lib/tenancy/context";

export type AuthContext = {
  tenantId: string;
  userId: string;
};

/** Resolve app `user.id` for inserts — prefers Supabase auth user when linked to tenant. */
export async function resolveAppUserId(supabaseUserId: string, tenantId: string): Promise<string> {
  const db = getDb();
  const linked = await db.query.user.findFirst({
    where: eq(user.id, supabaseUserId),
    columns: { id: true },
  });
  if (linked) {
    const member = await db.query.tenantMember.findFirst({
      where: eq(tenantMember.tenantId, tenantId),
      columns: { userId: true },
    });
    if (member && member.userId === linked.id) return linked.id;
  }
  const owner = await db.query.tenantMember.findFirst({
    where: eq(tenantMember.tenantId, tenantId),
    columns: { userId: true },
  });
  if (!owner) throw new Error(`No tenant member for tenant ${tenantId}`);
  return owner.userId;
}

async function tenantIdForRequest(req?: Request): Promise<string | null> {
  try {
    return req ? await resolveTenantId(req) : await resolveTenantIdFromSession();
  } catch {
    const authUser = await getCurrentUser();
    if (authUser) return PRIMARY_TENANT_ID;
    return null;
  }
}

export async function getAuthContext(req?: Request): Promise<AuthContext | null> {
  const authUser = await getCurrentUser();
  if (!authUser) return null;

  const tenantId = await tenantIdForRequest(req);
  if (!tenantId) return null;

  const userId = await resolveAppUserId(authUser.id, tenantId);
  return { tenantId, userId };
}
