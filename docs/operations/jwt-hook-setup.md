# JWT Claims Hook Setup

## What the Hook Does

The `jwt-claims` Edge Function runs as a Supabase Custom Access Token Hook. Every time a user signs in, Supabase calls this function before issuing the JWT. The function:

1. Reads the user's `default_tenant_id` from the `user` table.
2. If `default_tenant_id` is `NULL`, falls back to the user's first active `tenant_member` row (ordered by `invited_at` ascending, non-revoked only).
3. Injects the resolved value as the `active_tenant_id` claim in the JWT.

Row-level security policies on all tenant-scoped tables use `(auth.jwt() ->> 'active_tenant_id')::uuid` to filter rows, so this claim must be present for any authenticated request to succeed.

## Deploying the Function

```bash
npx supabase functions deploy jwt-claims --no-verify-jwt
```

The `--no-verify-jwt` flag is required because Supabase calls Auth Hooks with a service-role request, not a user JWT.

Configure the hook in the Supabase dashboard **or** via `supabase/config.toml` for local dev:

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "http://host.docker.internal:54321/functions/v1/jwt-claims"
```

After changing `config.toml`, restart the local stack: `supabase stop && supabase start`.

Deploy the edge function locally:

```bash
supabase functions serve jwt-claims --no-verify-jwt
# Or rely on `supabase start` which serves functions from supabase/functions/
```

## Configuring the Hook in the Supabase Dashboard

1. Navigate to **Authentication** → **Hooks** in the Supabase dashboard.
2. Under **Custom Access Token Hook**, click **Add hook**.
3. Select the `jwt-claims` Edge Function from the dropdown.
4. Save.

The hook is now active. Every new sign-in will include the `active_tenant_id` claim. Existing sessions are unaffected until the user signs in again.

## Verifying the Hook Works

1. Sign in to the application.
2. Copy the access token from the response (or from browser dev tools → Application → Local Storage).
3. Paste it into [jwt.io](https://jwt.io).
4. In the **Payload** section, confirm the `active_tenant_id` field is present and contains a valid UUID.

## Updating a User's Default Tenant

To change which tenant a user defaults to on sign-in, update the `default_tenant_id` column in the `user` table:

```sql
UPDATE "user"
SET default_tenant_id = '<target-tenant-uuid>'
WHERE id = '<user-uuid>';
```

The change takes effect on the user's next sign-in.
