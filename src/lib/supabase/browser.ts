import { createBrowserClient as ssr } from "@supabase/ssr";
import { env } from "@/env";

export const supabaseBrowser = () =>
  ssr(env().SUPABASE_URL!, env().SUPABASE_ANON_KEY!, {
    auth: { experimental: { passkey: true } },
  });
