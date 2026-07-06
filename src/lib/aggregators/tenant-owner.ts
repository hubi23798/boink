import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { tenantMember } from "@/lib/db/schema";

export async function resolveTenantOwnerUserId(db: Db, tenantId: string): Promise<string> {
  const owner = await db.query.tenantMember.findFirst({
    where: and(
      eq(tenantMember.tenantId, tenantId),
      eq(tenantMember.role, "owner"),
      isNull(tenantMember.revokedAt),
    ),
    columns: { userId: true },
  });
  if (!owner) throw new Error("tenant_owner_missing");
  return owner.userId;
}
