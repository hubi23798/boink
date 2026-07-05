# Supabase WebAuthn / Passkey Spike — Outcome

**Date:** 2026-06-30  
**Task:** TRU-A-00 (Linear TRF-71)  
**Question:** Can Supabase Auth serve as **primary** passkey login for truffe.ai (HNW financial OS), replacing the legacy SimpleWebAuthn + session cookie path?

---

## Executive verdict

**Plan A — Use Supabase native Passkeys (beta) as primary auth.**

Do **not** rebuild SimpleWebAuthn + `passkey_credential` (Plan B) unless the passkey beta blocks us during TRU-A-03 implementation. Supabase shipped first-class passkey APIs in 2026 (`signInWithPasskey`, `registerPasskey`) — this is distinct from the older MFA WebAuthn factor model referenced in early Phase A drafts.

---

## Current state in truffe

| Area | Today |
|------|--------|
| Login UX | Magic link OTP via `signInWithOtp` ([`src/components/login-form.tsx`](../../src/components/login-form.tsx)) |
| Session bridge | Supabase OAuth callback mints legacy `session` cookie → `PRIMARY_USER_ID` ([`src/app/auth/callback/route.ts`](../../src/app/auth/callback/route.ts)) |
| Passkey tables | Dropped in migration `0001_swap_to_password_auth.sql` |
| Supabase JS | `^2.45` in package.json — **below passkey minimum** |
| Local Supabase | `[auth.passkey]` / `[auth.webauthn]` commented out in [`supabase/config.toml`](../../supabase/config.toml) |
| RP env | `RP_ID=localhost`, `RP_NAME=truffe.ai`, `ORIGIN` in `.env` — ready for WebAuthn RP config |

---

## What Supabase offers (June 2026)

Source: [Supabase Passkeys docs](https://supabase.com/docs/guides/auth/passkeys), [changelog beta announcement](https://supabase.com/changelog/46458-passkeys-for-supabase-auth-beta).

### Native passkey API (not MFA-only)

| Method | Purpose |
|--------|---------|
| `auth.signInWithPasskey()` | Discoverable credential login — **no email field required** |
| `auth.registerPasskey()` | Register passkey for **already authenticated** user |
| `auth.passkey.*` | Lower-level ceremony control |
| `auth.admin.passkey.*` | Admin list/delete |

Requirements:

- `@supabase/supabase-js` **≥ 2.105.0**
- Client opt-in (API experimental):

```ts
createBrowserClient(url, key, {
  auth: { experimental: { passkey: true } },
});
```

- Dashboard / `config.toml`: enable passkeys + WebAuthn RP (`rp_id`, `rp_origins`, display name)
- HTTPS in production (localhost OK for dev)

### Bootstrap constraint (important)

**Registration requires an existing confirmed user session.** You cannot cold-start a net-new tenant with passkey alone. Acceptable bootstrap for truffe:

1. **First enrollment:** magic link (or admin `createUser`) once → `registerPasskey()` on `/settings/passkeys`
2. **Daily login:** `signInWithPasskey()` only
3. **Recovery (Phase 2):** magic link fallback when all passkeys lost — spec already defers this

This matches the product spec: passkeys primary, email recovery later.

---

## Plan A vs Plan B

### Plan A — Supabase native passkeys (recommended)

**Pros**

- Full WebAuthn ceremony handled by Supabase Auth; no SimpleWebAuthn dependency
- Discoverable credentials = clean login button (“Sign in with passkey”)
- Credentials stored in `auth.webauthn_credentials` — no app-table sync
- Sessions are standard Supabase JWT + SSR cookies via `@supabase/ssr`
- Aligns with Phase A Tasks 10–12 (Auth migration, JWT hook)

**Cons / risks**

- **Beta / experimental** — API may change; pin `@supabase/supabase-js` after upgrade
- Requires client + server SDK bump (`^2.45` → `≥2.105`)
- SSO users cannot register passkeys (N/A for truffe v1)
- `webauthn_challenge_expired` if user stalls on biometric prompt — need retry UX
- First-time users still need one non-passkey bootstrap (magic link OK for MVP)

### Plan B — Hybrid SimpleWebAuthn + Supabase JWT issuer

Keep custom `passkey_credential` table, verify with `@simplewebauthn/server`, mint Supabase session via admin API.

**When to use:** Only if Plan A beta breaks multi-tenant JWT hook integration or EU project passkeys are unavailable at cutover.

**Cost:** Re-introduce passkey tables, challenge storage, enrollment endpoints — duplicates what Supabase now ships.

---

## Recommended implementation path (Tasks TRU-A-03+)

### 1. Upgrade dependencies

```bash
pnpm add @supabase/supabase-js@^2.105 @supabase/ssr@latest
```

Verify `@supabase/ssr` peer compatibility.

### 2. Enable passkeys locally

In `supabase/config.toml`:

```toml
[auth.passkey]
enabled = true

[auth.webauthn]
rp_display_name = "truffe.ai"
rp_id = "localhost"
rp_origins = ["http://127.0.0.1:3000", "http://localhost:3000"]
```

Production: `rp_id = "truffe.ai"` (or apex domain), origins = `https://truffe.ai`, `https://www.truffe.ai`.

### 3. Client setup

Update [`src/lib/supabase/browser.ts`](../../src/lib/supabase/browser.ts) and server client wrapper:

```ts
auth: { experimental: { passkey: true } },
```

### 4. Login flow (target)

| Step | Action |
|------|--------|
| Returning user | `signInWithPasskey()` → session in cookies → JWT hook adds `active_tenant_id` |
| New user (tenant signup) | Magic link once → `/settings/passkeys` → `registerPasskey()` |
| Remove | Legacy `createSession` bridge in auth callback |

### 5. Remove legacy session table usage

After TRU-A-03: delete `session` cookie path; all routes use `supabase.auth.getUser()` + RLS.

---

## Test plan (manual, local)

Prerequisites: `supabase start`, upgraded JS, passkey enabled in config, `pnpm dev`.

1. Create user via magic link (existing flow).
2. Call `registerPasskey()` from a settings page or temporary script.
3. Sign out.
4. Call `signInWithPasskey()` — confirm session without email.
5. Confirm `active_tenant_id` JWT claim present after auth hook (TRU-A-04).
6. Repeat on second device / iCloud-synced passkey if available.

**Not run in this spike:** Steps 1–6 were not executed in CI; verdict is based on Supabase docs, schema evidence (`auth.webauthn_credentials` in local catalog), and API maturity. Re-validate during TRU-A-03 before production cutover.

---

## Decision log

| # | Decision | Choice |
|---|----------|--------|
| 1 | Primary auth mechanism | Supabase native passkeys (Plan A) |
| 2 | Bootstrap for first passkey | Magic link once, then register |
| 3 | SimpleWebAuthn reintroduction | No (Plan B fallback only) |
| 4 | MFA WebAuthn factor | No — use passkey API, not `mfa.enroll({ factorType: 'webauthn' })` |
| 5 | SDK upgrade | Required before implementation |

---

## Unblocks

- **TRU-A-03** — Remove session bridge; wire passkey login
- **TRU-A-04** — JWT custom claim on Supabase session
- **TRU-A-05** — Tenant switch on Supabase user session

---

## References

- [Supabase Passkeys guide](https://supabase.com/docs/guides/auth/passkeys)
- [Passkeys beta changelog](https://supabase.com/changelog/46458-passkeys-for-supabase-auth-beta)
- [supabase-js PR #2263 — passkey API](https://github.com/supabase/supabase-js/pull/2263)
- Phase A plan Task 0: [`docs/superpowers/plans/2026-06-27-phase-a-tenancy-supabase.md`](../superpowers/plans/2026-06-27-phase-a-tenancy-supabase.md)
