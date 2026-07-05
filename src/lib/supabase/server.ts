import { createServerClient as ssr } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/env";

type CreateServerClientOptions = {
  /** Route Handlers and Server Actions may write cookies; Server Components may not. */
  allowCookieWrite?: boolean;
};

async function createSupabaseServerClient(options: CreateServerClientOptions = {}) {
  const { allowCookieWrite = false } = options;
  const cookieStore = await cookies();
  return ssr(env().SUPABASE_URL!, env().SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        if (!allowCookieWrite) {
          // Session refresh runs in proxy; Server Components must not mutate cookies.
          return;
        }
        for (const { name, value, options: cookieOptions } of toSet) {
          cookieStore.set(name, value, cookieOptions);
        }
      },
    },
    auth: { experimental: { passkey: true } },
  });
}

/** Read-only client for Server Components (default). */
export async function createServerClient() {
  return createSupabaseServerClient();
}

/** Writable client for Route Handlers and Server Actions. */
export async function createRouteHandlerClient() {
  return createSupabaseServerClient({ allowCookieWrite: true });
}

export function createServiceRoleClient() {
  // Bypasses RLS. NEVER use inside user-request paths. Only inside
  // cron / webhook handlers wrapped by runAsService.
  return ssr(env().SUPABASE_URL!, env().SUPABASE_SERVICE_ROLE_KEY!, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
