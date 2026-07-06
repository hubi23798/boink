import { z } from "zod";

const schema = z.object({
  // Postgres connection string. Accepts the canonical postgresql:// scheme
  // (used by Supabase: postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres)
  // and the legacy postgres:// scheme.
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((v) => v.startsWith("postgres://") || v.startsWith("postgresql://"), {
      message: "DATABASE_URL must use postgres:// or postgresql:// scheme",
    }),
  RP_ID: z.string().min(1),
  RP_NAME: z.string().min(1),
  ORIGIN: z.string().url(),
  // Cookie names default to non-__Host- variants because __Host- requires
  // Secure + HTTPS, which aren't available on local HTTP dev. Production
  // must override these to "__Host-session" / "__Host-enrollment" (and
  // serves over HTTPS so Secure is set). See cookies.ts.
  SESSION_COOKIE_NAME: z.string().default("session"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ADVISOR_DAILY_TOKEN_BUDGET: z.coerce.number().int().positive().default(200_000),
  ANTHROPIC_API_KEY: z.string().optional(),
  MODEL_ADVISOR: z.string().default("claude-opus-4-7"),
  // Single-user auth (replaces passkey enrollment).
  ADMIN_EMAIL: z.string().email().default("admin@truffe.ai"),
  // bcrypt hash of the admin password. Generate via:
  //   node -e "require('bcryptjs').hash('yourpassword', 12).then(console.log)"
  // Bcrypt hashes are exactly 60 chars ($2a/$2b prefix + 22-char salt + 31-char digest).
  // Optional in dev when AUTH_DISABLED=1 (bypass mode). The dummy default
  // is a valid-length placeholder that will never match a real password.
  ADMIN_PASSWORD: z
    .string()
    .min(60)
    .default("$2b$12$DISABLED000000000000000000000000000000000000000000000000"),
  // Shared secret for cron endpoints. If set, callers must pass it as
  // x-cron-secret header. Leave unset in local dev to skip the check.
  CRON_SECRET: z.string().min(16).optional(),
  // Supabase (required once Supabase is provisioned; optional during migration window)
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_DB_URL: z.string().min(1).optional(),
  SUPABASE_DB_DIRECT_URL: z.string().min(1).optional(),
  // Axiom structured logging (optional; logs silently dropped when unset)
  AXIOM_DATASET: z.string().optional(),
  AXIOM_TOKEN: z.string().optional(),
  // Phase B-EU aggregators
  TRUELAYER_CLIENT_ID: z.string().min(1).optional(),
  TRUELAYER_CLIENT_SECRET: z.string().min(1).optional(),
  TRUELAYER_ENV: z.enum(["sandbox", "live"]).default("sandbox"),
  AGGREGATOR_OAUTH_STATE_SECRET: z.string().min(16).optional(),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  return parsed.data;
}

let cached: Env | undefined;
export function env(): Env {
  if (!cached) cached = loadEnv();
  return cached;
}
