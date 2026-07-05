import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { PRIMARY_TENANT_ID, tenantMember, user } from "@/lib/db/schema";

/** Ensure public.user + tenant_member exist for a Supabase Auth user after sign-in. */
export async function ensureAppUserForAuth(db: Db, authUserId: string): Promise<void> {
  const existing = await db.query.user.findFirst({
    where: eq(user.id, authUserId),
    columns: { id: true },
  });
  if (!existing) {
    await db.insert(user).values({ id: authUserId }).onConflictDoNothing();
  }

  const membership = await db.query.tenantMember.findFirst({
    where: and(eq(tenantMember.userId, authUserId), isNull(tenantMember.revokedAt)),
    columns: { tenantId: true },
  });
  if (!membership) {
    await db
      .insert(tenantMember)
      .values({
        tenantId: PRIMARY_TENANT_ID,
        userId: authUserId,
        role: "owner",
        scope: "full_read",
        acceptedAt: new Date(),
      })
      .onConflictDoNothing();
    await db
      .update(user)
      .set({ defaultTenantId: PRIMARY_TENANT_ID })
      .where(eq(user.id, authUserId));
  }
}

export async function countActiveMemberships(db: Db, authUserId: string): Promise<number> {
  const rows = await db.query.tenantMember.findMany({
    where: and(eq(tenantMember.userId, authUserId), isNull(tenantMember.revokedAt)),
    columns: { tenantId: true },
  });
  return rows.length;
}
