import { createServerClient as ssr } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/env";

export async function createServerClient() {
  const cookieStore = await cookies();
  return ssr(env().SUPABASE_URL!, env().SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        for (const { name, value, options } of toSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
    auth: { experimental: { passkey: true } },
  });
}

export function createServiceRoleClient() {
  // Bypasses RLS. NEVER use inside user-request paths. Only inside
  // cron / webhook handlers wrapped by runAsService.
  return ssr(env().SUPABASE_URL!, env().SUPABASE_SERVICE_ROLE_KEY!, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
