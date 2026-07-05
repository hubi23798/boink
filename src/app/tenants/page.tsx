import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { createServerClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { tenant, tenantMember } from "@/lib/db/schema";

export default async function TenantPickerPage() {
  const supabase = await createServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const db = getDb();
  const memberships = await db
    .select({ id: tenant.id, name: tenant.name })
    .from(tenantMember)
    .innerJoin(tenant, eq(tenantMember.tenantId, tenant.id))
    .where(
      and(eq(tenantMember.userId, userData.user.id), isNull(tenantMember.revokedAt)),
    );

  if (memberships.length === 0) redirect("/login");
  if (memberships.length === 1) redirect("/");

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="mb-2 text-2xl font-semibold text-[#F7F4EE]">Choose a workspace</h1>
      <p className="mb-6 text-sm text-[#C4B8A8]">Select which tenant to open.</p>
      <ul className="space-y-2">
        {memberships.map((m) => (
          <li key={m.id}>
            <form action="/api/tenants/switch" method="POST">
              <input type="hidden" name="tenantId" value={m.id} />
              <button
                type="submit"
                className="w-full rounded-lg border border-[#4A2E1A] bg-[#3A2414] p-4 text-left text-[#F7F4EE] transition-colors hover:bg-[#4A2E1A]"
              >
                {m.name}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
