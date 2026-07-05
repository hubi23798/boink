import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { seedTwoTenants } from "./fixtures/two-tenants";

test("user A cannot read user B's accounts via Supabase REST", async () => {
  const { tB } = await seedTwoTenants();

  // Sign in as user A with anon client — JWT will have active_tenant_id = tA (via Auth Hook)
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

  // Generate a sign-in link for user A via service role, then exchange for session
  const adminClient = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: linkData } = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email: "a@truffe.test",
  });
  const token = linkData.properties?.hashed_token;

  if (token) {
    await supabase.auth.verifyOtp({ token_hash: token, type: "magiclink" });
  }

  // Attempt to read tB's accounts while authenticated as user A (active_tenant_id = tA)
  const { data } = await supabase.from("account").select("*").eq("tenant_id", tB);

  // RLS should reject: user A's JWT has active_tenant_id = tA, not tB
  expect(data ?? []).toEqual([]);
});

test("user A can read their own accounts", async () => {
  const { tA } = await seedTwoTenants();

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  const adminClient = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: linkData } = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email: "a@truffe.test",
  });
  const token = linkData.properties?.hashed_token;

  if (token) {
    await supabase.auth.verifyOtp({ token_hash: token, type: "magiclink" });
  }

  const { data } = await supabase.from("account").select("*").eq("tenant_id", tA);
  expect((data ?? []).length).toBeGreaterThan(0);
});
