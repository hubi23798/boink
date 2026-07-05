import { createClient } from "@supabase/supabase-js";
import { getDb } from "@/lib/db/client";
import { tenant, tenantMember, account } from "@/lib/db/schema";

export async function seedTwoTenants() {
  const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const db = getDb();

  const { data: userAData } = await admin.auth.admin.createUser({
    email: "a@truffe.test",
    email_confirm: true,
  });
  const { data: userBData } = await admin.auth.admin.createUser({
    email: "b@truffe.test",
    email_confirm: true,
  });

  const [tA] = await db
    .insert(tenant)
    .values({ name: "A", plan: "trial", region: "us" })
    .returning();
  const [tB] = await db
    .insert(tenant)
    .values({ name: "B", plan: "trial", region: "us" })
    .returning();

  await db
    .insert(tenantMember)
    .values({
      tenantId: tA!.id,
      userId: userAData.user!.id,
      role: "owner",
      acceptedAt: new Date(),
    });
  await db
    .insert(tenantMember)
    .values({
      tenantId: tB!.id,
      userId: userBData.user!.id,
      role: "owner",
      acceptedAt: new Date(),
    });

  await db
    .insert(account)
    .values({
      tenantId: tA!.id,
      userId: userAData.user!.id,
      name: "A-checking",
      kind: "cash",
      currency: "USD",
    });
  await db
    .insert(account)
    .values({
      tenantId: tB!.id,
      userId: userBData.user!.id,
      name: "B-checking",
      kind: "cash",
      currency: "USD",
    });

  return { tA: tA!.id, tB: tB!.id, userA: userAData.user!.id, userB: userBData.user!.id };
}
