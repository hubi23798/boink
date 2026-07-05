# Supabase EU Project Provisioning (TRU-A-01)

**Task:** TRF-72  
**Region:** `eu-central-1` (Frankfurt) — GDPR-aligned primary for truffe.ai  
**Project name:** `truffe-eu`

Local development continues to use `supabase start` (Docker). This runbook covers the **production/staging cloud project**.

---

## 1. Create the project

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → **New project**.
2. **Name:** `truffe-eu`
3. **Region:** `Europe (Frankfurt) — eu-central-1`
4. **Postgres:** 16+
5. Save the database password in your password manager.

Note the **Project URL** and **API keys** from **Project Settings → API**.

---

## 2. Connection strings

From **Project Settings → Database**:

| Variable | Source |
|----------|--------|
| `SUPABASE_URL` | Project URL (`https://<ref>.supabase.co`) |
| `SUPABASE_ANON_KEY` | anon / public key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (server-only, never expose to browser) |
| `SUPABASE_DB_DIRECT_URL` | Direct connection (port 5432) — use for Drizzle migrations |
| `SUPABASE_DB_URL` | Pooler connection (port 6543, `?pgbouncer=true`) — use for app runtime if pooling |

Copy into `.env` (never commit):

```bash
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_DB_DIRECT_URL=postgresql://postgres.<ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DATABASE_URL=$SUPABASE_DB_URL
```

During the migration window, `drizzle.config.ts` prefers `SUPABASE_DB_DIRECT_URL` for migrations.

---

## 3. Apply schema

```bash
pnpm db:migrate
```

Verify tenant seed:

```sql
SELECT id, name, region FROM tenant;
-- Expect primary tenant id 00000000-0000-0000-0000-0000000000aa
```

Optional — set primary tenant region to EU:

```sql
UPDATE tenant SET region = 'eu' WHERE id = '00000000-0000-0000-0000-0000000000aa';
```

---

## 4. Deploy JWT claims hook

See [`jwt-hook-setup.md`](./jwt-hook-setup.md).

```bash
npx supabase link --project-ref <ref>
npx supabase functions deploy jwt-claims --no-verify-jwt
```

Dashboard → **Authentication → Hooks → Custom Access Token Hook** → select `jwt-claims`.

---

## 5. Enable passkeys (TRU-A-03+)

Dashboard → **Authentication → Providers → Passkeys** → enable.

Or mirror local `supabase/config.toml`:

```toml
[auth.passkey]
enabled = true

[auth.webauthn]
rp_display_name = "truffe.ai"
rp_id = "truffe.ai"
rp_origins = ["https://truffe.ai", "https://www.truffe.ai"]
```

---

## 6. Auth redirect URLs

Dashboard → **Authentication → URL Configuration**:

| Setting | Value |
|---------|-------|
| Site URL | `https://truffe.ai` |
| Redirect URLs | `https://truffe.ai/auth/callback`, `http://localhost:3000/auth/callback` |

---

## 7. Vercel env vars

Set the same five `SUPABASE_*` vars on the Vercel project (Production + Preview). Also set:

- `RP_ID=truffe.ai`
- `ORIGIN=https://truffe.ai`

---

## 8. Smoke test

1. Magic-link sign-in on preview deploy.
2. Decode JWT at [jwt.io](https://jwt.io) — confirm `active_tenant_id` claim.
3. Dashboard loads with tenant-scoped data.
4. Passkey registration + sign-in (after TRU-A-03 ships).

---

## Deferred

- **US expansion:** separate `truffe-us` project — tracked under TRU-US-01.
- **Data residency audit:** document sub-processors once TrueLayer/Tink integrated (Phase B-EU).
