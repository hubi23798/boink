# Phase B-Trust — Observers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owner invites a spouse/accountant/attorney as a read-only observer via signed email link; the observer accepts with their own auth, lands on `/observe`, sees the hash-chain-verified audit log scoped to their permission level, receives a daily digest, and cannot be silently removed (72h cooling-off). Owner mutations show "Visible to N observers" badges.

**Architecture:** Invites live in a new `observer_invite` table (random token, only its SHA-256 hash stored; single-use, 7-day expiry). Accepting creates a `tenant_member` row with `role = observer` and the invite's scope — the existing `tenant_member` table already has all needed columns. Scope enforcement is two-layer: app-layer helpers in `src/lib/observers/scope.ts` (the enforcement path for Next.js routes, which use a direct Drizzle connection) plus restrictive RLS policies keyed off new JWT claims `member_role` / `observer_scope` (defense in depth for the Supabase client path). Revoke sets `revoked_at = now() + 72h` — future-dated, so every "active membership" predicate changes from `revoked_at IS NULL` to `revoked_at IS NULL OR revoked_at > now()`. Daily digest is a cron route following the existing `/api/cron/*` + `x-cron-secret` convention, sending via Resend.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Drizzle ORM 0.45, Postgres (Supabase), Supabase Auth (custom access token hook Edge Function `jwt-claims`), Resend, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-27-hnw-fraud-spine-design.md` §2.2, §4.1–§4.4, §5 Phase B (observer bullets).

---

## Linear task mapping

| Plan task | Linear | Title |
|---|---|---|
| Task 1 | TRU-BTR-01 (part), TRU-BTR-07, TRU-BTR-09 (part) | Migrations: `observer_invite`, cooling-off predicate fix, `advisor_conversation.visibility` |
| Task 2 | TRU-BTR-01 | Invite token library |
| Task 3 | TRU-BTR-01 | Invite/revoke/scope-edit API + Resend email |
| Task 4 | TRU-BTR-02 | Observer signup + accept flow |
| Task 5 | TRU-BTR-03 (part) | JWT claims: `member_role` + `observer_scope` |
| Task 6 | TRU-BTR-03 | RLS scope policies |
| Task 7 | TRU-BTR-03 (app layer) | App-layer scope helpers |
| Task 8 | TRU-BTR-01 | `/settings/observers` owner UI |
| Task 9 | TRU-BTR-04 | Observer routes: `/observe`, `/observe/audit` |
| Task 10 | TRU-BTR-05 | Observer routes: `/observe/signals`, `/observe/decisions`, `/observe/connections` |
| Task 11 | TRU-BTR-06 | "Visible to N observers" mutation badges |
| Task 12 | TRU-BTR-07 | Advisor conversation visibility enforcement |
| Task 13 | TRU-BTR-09 | 72h cooling-off on revoke |
| Task 14 | TRU-BTR-08 | Daily digest email |
| Task 15 | TRU-BTR-10 | E2E: invite → audit log → denied private advisor |

## Relationship to the Phase B-EU plan

`2026-06-27-phase-b-eu-open-banking.md` Tasks 7, 8, 13, and 14 sketched observer work before the roadmap split observers into their own Linear project (Phase B-Trust). **This plan supersedes those four tasks** — execute observer work from here. The B-EU plan remains authoritative for connections, detectors, and the advisor refusal policy.

Two deliberate touch points with B-EU:

- `/observe/signals` and `/observe/connections` render empty states until `fraud_signal` (B-EU Task 1) and `connection` (B-EU Task 1) tables exist. The pages in Task 10 query information_schema-guarded, so they ship first without breaking.
- The digest (Task 14) includes a connection-status section only when the `connection` table exists (TRU-BTR-08 is blocked by TRU-BEU-06 in Linear for full content; the digest itself ships and degrades gracefully).

**Migration numbering:** the B-EU plan references `0015_*`–`0018_*`, written before `0015_audit_log_v2.sql`–`0017_drop_old_audit_log.sql` landed. Numbers in both plans are placeholders — at execution time use the next free number in `src/lib/db/migrations/`. As of this writing the next free number is **0018**; this plan uses 0018–0020. If B-EU migrations land first, renumber accordingly (names are authoritative, numbers are not).

**Decisions locked here** (spec left them open):

- **Email provider: Resend** — matches B-EU plan Task 13 choice; `.env.example` already stubs `RESEND_API_KEY`.
- **Invite token: random 256-bit value, SHA-256 hash stored in DB** (not a stateless HMAC JWT). DB-backed tokens are single-use and revocable before acceptance; a stateless JWT is neither. `.env.example`'s `OBSERVER_INVITE_SECRET` stub is not needed and stays commented out.

---

## File Structure

**New files:**

```
src/lib/db/migrations/
  0018_observer_invite.sql            -- observer_invite table + RLS
  0019_cooling_off_predicates.sql     -- revoked_at > now() predicate fix on tenant/tenant_member policies
  0020_observer_scope_policies.sql    -- advisor visibility column + restrictive observer RLS policies

src/lib/observers/
  invite.ts                           -- token generate/hash/expiry constants
  scope.ts                            -- getMembership, isMembershipActive, assertScope, activeObserverCount
  email.ts                            -- Resend wrapper: invite, revoke-notice, digest sends
  digest.ts                           -- buildDigest(db, tenantId, since) → owner + per-observer variants

src/app/api/observers/
  route.ts                            -- GET list (owner), POST invite
  [id]/route.ts                       -- PATCH scope edit, DELETE revoke (72h)
  accept/route.ts                     -- POST accept invite (authed)

src/app/accept-invite/page.tsx        -- public invite landing (token → tenant name + scope + CTA)

src/app/settings/observers/page.tsx   -- owner UI: active list, pending invites, invite form
src/app/settings/observers/observers-client.tsx -- client component: forms + confirm dialogs

src/app/observe/
  layout.tsx                          -- observer gate + nav shell
  page.tsx                            -- landing: tenant, scope badge, open-signal count, recent audit, pending-revoke banner
  audit/page.tsx                      -- audit viewer: filters, pagination, hash-chain badge
  signals/page.tsx                    -- open fraud signals (empty state until fraud_signal exists)
  decisions/page.tsx                  -- accepted proposals + dismissed signals
  connections/page.tsx                -- connection status (empty state until connection exists)

src/app/api/cron/daily-digest/route.ts -- POST, x-cron-secret guarded

src/components/observer-visibility-badge.tsx -- "Visible to N observers"

tests/unit/
  observer-invite.test.ts
  observer-scope.test.ts
  observer-digest.test.ts
tests/e2e/
  observer-invite.spec.ts             -- invite → accept → lands on /observe
  observer-rls.spec.ts                -- adversarial scope checks (all three scopes)
```

**Modified files:**

- `src/lib/db/schema.ts` — add `observerInvite` table, `visibility` column + enum on `advisorConversation`.
- `src/lib/tenancy/sync-user.ts` — skip auto-owner membership when a pending `observer_invite` matches the auth user's email; fix `revoked_at` predicates.
- `supabase/functions/jwt-claims/index.ts` — add `member_role`, `observer_scope` claims; fix `revoked_at` predicate.
- `src/lib/auth/guard.ts` — return `role`/`scope` in `AuthContext`.
- `src/proxy.ts` — add `/accept-invite` to `PUBLIC_PATHS`.
- `src/app/tenants/page.tsx`, `src/app/api/tenants/switch/route.ts` — `revoked_at` predicate fix; route observers to `/observe`.
- `src/app/api/advisor/conversations/route.ts` — set `visibility` on create.
- `src/components/nav.tsx` — hide owner nav for observers (observers use `/observe` shell).
- `.env.example` — uncomment `RESEND_API_KEY`; add `DIGEST_FROM_EMAIL`.

---

## Task 1: Migrations — observer_invite, cooling-off predicates, advisor visibility

**Files:**
- Create: `src/lib/db/migrations/0018_observer_invite.sql`
- Create: `src/lib/db/migrations/0019_cooling_off_predicates.sql`
- Create: `src/lib/db/migrations/0020_observer_scope_policies.sql` (written in Task 6; file listed here so numbering is reserved)
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Write migration 0018 — observer_invite**

```sql
CREATE TABLE observer_invite (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  email text NOT NULL,
  scope member_scope NOT NULL,
  invited_by uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_user_id uuid REFERENCES "user"(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX observer_invite_tenant_id_idx ON observer_invite (tenant_id);
CREATE INDEX observer_invite_email_pending_idx ON observer_invite (lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

ALTER TABLE observer_invite ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON observer_invite
  FOR ALL TO authenticated
  USING (tenant_id = (auth.jwt() ->> 'active_tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'active_tenant_id')::uuid);
```

- [ ] **Step 2: Write migration 0019 — cooling-off predicates**

The 72h cooling-off future-dates `tenant_member.revoked_at`. Existing policies treat any non-NULL `revoked_at` as revoked, which would cut access at the moment of scheduling instead of 72h later. Fix:

```sql
-- tenant read policy: membership is active until revoked_at passes
DROP POLICY tenant_member_read ON tenant;
CREATE POLICY tenant_member_read ON tenant
  FOR SELECT TO authenticated
  USING (id IN (
    SELECT tenant_id FROM tenant_member
    WHERE user_id = auth.uid()
      AND (revoked_at IS NULL OR revoked_at > now())
  ));

-- tenant_member partial index: same predicate
DROP INDEX tenant_member_user_id_idx;
CREATE INDEX tenant_member_user_id_idx ON tenant_member (user_id)
  WHERE revoked_at IS NULL;
-- (partial indexes cannot use now(); keep IS NULL as the index filter and
--  let the planner fall back for scheduled-revoke rows — they are rare)
```

- [ ] **Step 3: Add `visibility` to advisor_conversation (goes in 0020 with the scope policies, Task 6 Step 1 — column shown here for schema.ts work)**

- [ ] **Step 4: Add Drizzle schema definitions**

In `src/lib/db/schema.ts`:

```ts
export const conversationVisibilityEnum = pgEnum("conversation_visibility", [
  "owner_private",
  "observers_visible",
]);

export const observerInvite = pgTable(
  "observer_invite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    scope: memberScopeEnum("scope").notNull(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tokenHash: bytea("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedUserId: uuid("accepted_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("observer_invite_tenant_id_idx").on(t.tenantId)],
);

export type ObserverInvite = typeof observerInvite.$inferSelect;
export type NewObserverInvite = typeof observerInvite.$inferInsert;
```

And on `advisorConversation` add:

```ts
visibility: conversationVisibilityEnum("visibility").notNull().default("owner_private"),
```

- [ ] **Step 5: Run migrations, verify**

Run: `pnpm db:migrate`
Expected: 0018 and 0019 apply cleanly. Then `psql "$DATABASE_URL" -c '\d observer_invite'` shows the table with RLS enabled.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/migrations/0018_observer_invite.sql src/lib/db/migrations/0019_cooling_off_predicates.sql src/lib/db/schema.ts
git commit -m "feat(observers): observer_invite table + cooling-off RLS predicates"
```

---

## Task 2: Invite token library

**Files:**
- Create: `src/lib/observers/invite.ts`
- Test: `tests/unit/observer-invite.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  generateInviteToken,
  hashInviteToken,
  isInviteUsable,
  INVITE_TTL_MS,
} from "@/lib/observers/invite";

describe("invite token", () => {
  it("generates a url-safe token whose hash matches hashInviteToken", () => {
    const { token, tokenHash } = generateInviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url
    expect(hashInviteToken(token).equals(tokenHash)).toBe(true);
  });

  it("generates unique tokens", () => {
    expect(generateInviteToken().token).not.toBe(generateInviteToken().token);
  });

  it("TTL is 7 days", () => {
    expect(INVITE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("isInviteUsable rejects expired, revoked, and accepted invites", () => {
    const base = {
      expiresAt: new Date(Date.now() + 1000),
      acceptedAt: null,
      revokedAt: null,
    };
    expect(isInviteUsable(base)).toBe(true);
    expect(isInviteUsable({ ...base, expiresAt: new Date(Date.now() - 1) })).toBe(false);
    expect(isInviteUsable({ ...base, acceptedAt: new Date() })).toBe(false);
    expect(isInviteUsable({ ...base, revokedAt: new Date() })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/observer-invite.test.ts`
Expected: FAIL — module `@/lib/observers/invite` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import { createHash, randomBytes } from "node:crypto";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 32 random bytes, base64url. Only the SHA-256 hash is persisted. */
export function generateInviteToken(): { token: string; tokenHash: Buffer } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

export interface InviteUsability {
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

export function isInviteUsable(invite: InviteUsability, now: Date = new Date()): boolean {
  if (invite.acceptedAt !== null) return false;
  if (invite.revokedAt !== null) return false;
  if (invite.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/observer-invite.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/observers/invite.ts tests/unit/observer-invite.test.ts
git commit -m "feat(observers): invite token generate/hash/usability"
```

---

## Task 3: Invite API + Resend email

**Files:**
- Create: `src/lib/observers/email.ts`
- Create: `src/app/api/observers/route.ts`
- Create: `src/app/api/observers/[id]/route.ts`
- Modify: `.env.example`

- [ ] **Step 1: Resend wrapper**

```ts
// src/lib/observers/email.ts
import { env } from "@/env";

interface SendParams {
  to: string;
  subject: string;
  text: string;
}

/** Plain-text transactional email via Resend. No-op (logged) when RESEND_API_KEY unset. */
export async function sendEmail({ to, subject, text }: SendParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.DIGEST_FROM_EMAIL ?? "truffe.ai <noreply@truffe.ai>";
  if (!apiKey) {
    console.info(`[email:skipped] to=${to} subject=${subject}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
  }
}

export function inviteEmailText(params: {
  tenantName: string;
  scope: string;
  acceptUrl: string;
}): string {
  return [
    `You've been invited as a read-only observer of "${params.tenantName}" on truffe.ai.`,
    ``,
    `Access level: ${params.scope}`,
    ``,
    `Accept the invitation (link expires in 7 days):`,
    params.acceptUrl,
    ``,
    `As an observer you can review activity but never change anything.`,
  ].join("\n");
}
```

Plain text only — matches B-EU plan Task 13 decision (no HTML at MVP).

- [ ] **Step 2: Invite + list route**

```ts
// src/app/api/observers/route.ts
import { NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireApiAuth } from "@/app/lib/require-auth";
import { appendAudit } from "@/lib/audit/append";
import { getDb } from "@/lib/db/client";
import { observerInvite, tenant, tenantMember, user } from "@/lib/db/schema";
import { generateInviteToken, INVITE_TTL_MS } from "@/lib/observers/invite";
import { inviteEmailText, sendEmail } from "@/lib/observers/email";
import { requireOwner } from "@/lib/observers/scope";

const inviteSchema = z.object({
  email: z.string().email().max(320),
  scope: z.enum(["full_read", "ledger_only", "audit_only"]),
});

export async function GET(req: Request) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;
  const denied = await requireOwner(auth.ctx);
  if (denied) return denied;

  const db = getDb();
  const members = await db
    .select({
      userId: tenantMember.userId,
      scope: tenantMember.scope,
      acceptedAt: tenantMember.acceptedAt,
      revokedAt: tenantMember.revokedAt,
    })
    .from(tenantMember)
    .where(
      and(
        eq(tenantMember.tenantId, auth.ctx.tenantId),
        eq(tenantMember.role, "observer"),
      ),
    );
  const pending = await db
    .select({
      id: observerInvite.id,
      email: observerInvite.email,
      scope: observerInvite.scope,
      expiresAt: observerInvite.expiresAt,
      createdAt: observerInvite.createdAt,
    })
    .from(observerInvite)
    .where(
      and(
        eq(observerInvite.tenantId, auth.ctx.tenantId),
        isNull(observerInvite.acceptedAt),
        isNull(observerInvite.revokedAt),
      ),
    )
    .orderBy(desc(observerInvite.createdAt));

  return NextResponse.json({ members, pending });
}

export async function POST(req: Request) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;
  const denied = await requireOwner(auth.ctx);
  if (denied) return denied;

  const parsed = inviteSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { email, scope } = parsed.data;

  const db = getDb();
  const { token, tokenHash } = generateInviteToken();
  const [invite] = await db
    .insert(observerInvite)
    .values({
      tenantId: auth.ctx.tenantId,
      email: email.toLowerCase(),
      scope,
      invitedBy: auth.ctx.userId,
      tokenHash,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    })
    .returning({ id: observerInvite.id });
  if (!invite) {
    return NextResponse.json({ error: "insert failed" }, { status: 500 });
  }

  const [tenantRow] = await db
    .select({ name: tenant.name })
    .from(tenant)
    .where(eq(tenant.id, auth.ctx.tenantId));
  const acceptUrl = `${process.env.ORIGIN ?? "http://localhost:3000"}/accept-invite?token=${token}`;
  await sendEmail({
    to: email,
    subject: `You've been invited to observe ${tenantRow?.name ?? "a truffe.ai workspace"}`,
    text: inviteEmailText({ tenantName: tenantRow?.name ?? "truffe.ai", scope, acceptUrl }),
  });

  await appendAudit(db, {
    tenantId: auth.ctx.tenantId,
    actorUserId: auth.ctx.userId,
    action: "observer.invite",
    targetType: "observer_invite",
    targetId: invite.id,
    after: { email: email.toLowerCase(), scope },
  });

  return NextResponse.json({ ok: true, id: invite.id }, { status: 201 });
}
```

Note: the raw `token` is never persisted or audit-logged — only emailed.

- [ ] **Step 3: Scope edit + revoke route**

```ts
// src/app/api/observers/[id]/route.ts
// [id] is the observer's user_id for members, or the invite id for pending invites.
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireApiAuth } from "@/app/lib/require-auth";
import { appendAudit } from "@/lib/audit/append";
import { getDb } from "@/lib/db/client";
import { observerInvite, tenantMember } from "@/lib/db/schema";
import { requireOwner } from "@/lib/observers/scope";

const patchSchema = z.object({
  scope: z.enum(["full_read", "ledger_only", "audit_only"]),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;
  const denied = await requireOwner(auth.ctx);
  if (denied) return denied;

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const db = getDb();
  const [before] = await db
    .select({ scope: tenantMember.scope })
    .from(tenantMember)
    .where(
      and(
        eq(tenantMember.tenantId, auth.ctx.tenantId),
        eq(tenantMember.userId, id),
        eq(tenantMember.role, "observer"),
      ),
    );
  if (!before) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db
    .update(tenantMember)
    .set({ scope: parsed.data.scope })
    .where(
      and(eq(tenantMember.tenantId, auth.ctx.tenantId), eq(tenantMember.userId, id)),
    );

  await appendAudit(db, {
    tenantId: auth.ctx.tenantId,
    actorUserId: auth.ctx.userId,
    action: "observer.scope_change",
    targetType: "tenant_member",
    targetId: id,
    before: { scope: before.scope },
    after: { scope: parsed.data.scope },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;
  const denied = await requireOwner(auth.ctx);
  if (denied) return denied;

  const { id } = await params;
  const db = getDb();

  // Pending invite? Revoke instantly (nobody has access yet — no cooling-off).
  const [invite] = await db
    .select({ id: observerInvite.id, email: observerInvite.email })
    .from(observerInvite)
    .where(
      and(
        eq(observerInvite.id, id),
        eq(observerInvite.tenantId, auth.ctx.tenantId),
        isNull(observerInvite.acceptedAt),
        isNull(observerInvite.revokedAt),
      ),
    );
  if (invite) {
    await db
      .update(observerInvite)
      .set({ revokedAt: new Date() })
      .where(eq(observerInvite.id, invite.id));
    await appendAudit(db, {
      tenantId: auth.ctx.tenantId,
      actorUserId: auth.ctx.userId,
      action: "observer.invite_revoke",
      targetType: "observer_invite",
      targetId: invite.id,
    });
    return NextResponse.json({ ok: true, coolingOff: false });
  }

  // Active member → 72h cooling-off (Task 13 wires notification email).
  const { scheduleObserverRevoke } = await import("@/lib/observers/scope");
  const result = await scheduleObserverRevoke(db, {
    tenantId: auth.ctx.tenantId,
    observerUserId: id,
    actorUserId: auth.ctx.userId,
  });
  if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, coolingOff: true, effectiveAt: result.effectiveAt });
}
```

- [ ] **Step 4: `.env.example` update**

Uncomment `RESEND_API_KEY=`; add `# DIGEST_FROM_EMAIL=truffe.ai <digest@truffe.ai>` under it. Remove the `# OBSERVER_INVITE_SECRET=` line (decision: DB-hashed tokens, no HMAC secret).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: fails only on `requireOwner` / `scheduleObserverRevoke` not existing yet (created in Task 7). If executing tasks in order, stub them in Task 3 or pull Task 7 Steps 1–3 forward; the plan orders Task 7 before first deploy either way.

- [ ] **Step 6: Commit**

```bash
git add src/lib/observers/email.ts src/app/api/observers/ .env.example
git commit -m "feat(observers): invite/list/scope-edit/revoke API + Resend email"
```

---

## Task 4: Observer signup + accept flow

**Files:**
- Create: `src/app/accept-invite/page.tsx`
- Create: `src/app/api/observers/accept/route.ts`
- Modify: `src/proxy.ts`
- Modify: `src/lib/tenancy/sync-user.ts`
- Modify: `src/app/api/tenants/switch/route.ts`

- [ ] **Step 1: Public path**

In `src/proxy.ts` add `"/accept-invite"` to `PUBLIC_PATHS` (the page must render for logged-out invitees; the accept API still requires auth).

- [ ] **Step 2: Accept landing page**

```tsx
// src/app/accept-invite/page.tsx
import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { observerInvite, tenant } from "@/lib/db/schema";
import { hashInviteToken, isInviteUsable } from "@/lib/observers/invite";
import { createServerClient } from "@/lib/supabase/server";
import { AcceptInviteButton } from "./accept-invite-button";

const SCOPE_LABELS: Record<string, string> = {
  full_read: "Full read access (including advisor conversations)",
  ledger_only: "Ledger access (no private advisor conversations)",
  audit_only: "Audit log and decisions only (no balances)",
};

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const invalid = (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="mb-2 text-2xl font-semibold text-[#F7F4EE]">Invitation not valid</h1>
      <p className="text-sm text-[#C4B8A8]">
        This invitation link is invalid, expired, or already used. Ask the account
        owner to send a new one.
      </p>
    </main>
  );
  if (!token) return invalid;

  const db = getDb();
  const [invite] = await db
    .select({
      id: observerInvite.id,
      scope: observerInvite.scope,
      expiresAt: observerInvite.expiresAt,
      acceptedAt: observerInvite.acceptedAt,
      revokedAt: observerInvite.revokedAt,
      tenantName: tenant.name,
    })
    .from(observerInvite)
    .innerJoin(tenant, eq(observerInvite.tenantId, tenant.id))
    .where(
      and(eq(observerInvite.tokenHash, hashInviteToken(token)), isNull(observerInvite.revokedAt)),
    );
  if (!invite || !isInviteUsable(invite)) return invalid;

  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  const signedIn = Boolean(data.user);
  const selfUrl = `/accept-invite?token=${encodeURIComponent(token)}`;

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="mb-2 text-2xl font-semibold text-[#F7F4EE]">
        Observe “{invite.tenantName}”
      </h1>
      <p className="mb-6 text-sm text-[#C4B8A8]">
        You’ve been invited as a read-only observer. {SCOPE_LABELS[invite.scope]}.
        You can review activity but never change anything.
      </p>
      {signedIn ? (
        <AcceptInviteButton token={token} />
      ) : (
        <Link
          href={`/login?from=${encodeURIComponent(selfUrl)}`}
          className="block w-full rounded-lg border border-[#4A2E1A] bg-[#3A2414] p-4 text-center text-[#F7F4EE] transition-colors hover:bg-[#4A2E1A]"
        >
          Sign in or create an account to accept
        </Link>
      )}
    </main>
  );
}
```

`accept-invite-button.tsx` is a small client component: POSTs `{ token }` to `/api/observers/accept`, then `window.location.assign("/observe")` on success, shows the error message on failure.

- [ ] **Step 3: Accept API**

```ts
// src/app/api/observers/accept/route.ts
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { appendAudit } from "@/lib/audit/append";
import { getDb } from "@/lib/db/client";
import { observerInvite, tenantMember, user } from "@/lib/db/schema";
import { hashInviteToken, isInviteUsable } from "@/lib/observers/invite";
import { createServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({ token: z.string().min(1).max(128) });

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const db = getDb();
  const [invite] = await db
    .select()
    .from(observerInvite)
    .where(
      and(
        eq(observerInvite.tokenHash, hashInviteToken(parsed.data.token)),
        isNull(observerInvite.revokedAt),
      ),
    );
  if (!invite || !isInviteUsable(invite)) {
    return NextResponse.json({ error: "invite not valid" }, { status: 410 });
  }

  const authUserId = data.user.id;
  await db.transaction(async (tx) => {
    await tx.insert(user).values({ id: authUserId }).onConflictDoNothing();
    await tx
      .insert(tenantMember)
      .values({
        tenantId: invite.tenantId,
        userId: authUserId,
        role: "observer",
        scope: invite.scope,
        invitedBy: invite.invitedBy,
        invitedAt: invite.createdAt,
        acceptedAt: new Date(),
      })
      .onConflictDoNothing();
    await tx
      .update(observerInvite)
      .set({ acceptedAt: new Date(), acceptedUserId: authUserId })
      .where(eq(observerInvite.id, invite.id));
    await tx
      .update(user)
      .set({ defaultTenantId: invite.tenantId })
      .where(and(eq(user.id, authUserId), isNull(user.defaultTenantId)));
  });

  await appendAudit(db, {
    tenantId: invite.tenantId,
    actorUserId: authUserId,
    action: "observer.accept",
    targetType: "tenant_member",
    targetId: authUserId,
    after: { scope: invite.scope },
  });

  // Refresh so the jwt-claims hook mints active_tenant_id + observer_scope claims.
  await supabase.auth.refreshSession();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Stop `ensureAppUserForAuth` auto-owning new observers**

`src/lib/tenancy/sync-user.ts` currently gives every new auth user an **owner** membership on `PRIMARY_TENANT_ID`. An invitee signing up to accept would become an owner of the founder tenant. Fix: skip the auto-membership when a pending invite matches the user's email, and use the cooling-off-aware predicate:

```ts
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { observerInvite, PRIMARY_TENANT_ID, tenantMember, user } from "@/lib/db/schema";

const membershipActive = or(
  isNull(tenantMember.revokedAt),
  gt(tenantMember.revokedAt, sql`now()`),
);

/** Ensure public.user + tenant_member exist for a Supabase Auth user after sign-in. */
export async function ensureAppUserForAuth(
  db: Db,
  authUserId: string,
  authUserEmail?: string | null,
): Promise<void> {
  const existing = await db.query.user.findFirst({
    where: eq(user.id, authUserId),
    columns: { id: true },
  });
  if (!existing) {
    await db.insert(user).values({ id: authUserId }).onConflictDoNothing();
  }

  const membership = await db.query.tenantMember.findFirst({
    where: and(eq(tenantMember.userId, authUserId), membershipActive),
    columns: { tenantId: true },
  });
  if (membership) return;

  // Invited observers get their membership from the accept endpoint, not here.
  if (authUserEmail) {
    const pendingInvite = await db.query.observerInvite.findFirst({
      where: and(
        eq(observerInvite.email, authUserEmail.toLowerCase()),
        isNull(observerInvite.acceptedAt),
        isNull(observerInvite.revokedAt),
      ),
      columns: { id: true },
    });
    if (pendingInvite) return;
  }

  await db
    .insert(tenantMember)
    .values({
      tenantId: PRIMARY_TENANT_ID,
      userId: authUserId,
      role: "owner",
      scope: "full_read",
      acceptedAt: new Date(),
    })
    .onConflictDoNothing();
  await db
    .update(user)
    .set({ defaultTenantId: PRIMARY_TENANT_ID })
    .where(eq(user.id, authUserId));
}

export async function countActiveMemberships(db: Db, authUserId: string): Promise<number> {
  const rows = await db.query.tenantMember.findMany({
    where: and(eq(tenantMember.userId, authUserId), membershipActive),
    columns: { tenantId: true },
  });
  return rows.length;
}
```

Update the caller (`/api/auth/sync` route) to pass `data.user.email`.

- [ ] **Step 5: Route observers to `/observe` after tenant switch**

In `src/app/api/tenants/switch/route.ts`: change the membership predicate from `isNull(tenantMember.revokedAt)` to `or(isNull(tenantMember.revokedAt), gt(tenantMember.revokedAt, sql`now()`))`, and redirect to `/observe` when `membership.role === "observer"` instead of `/`. Apply the same predicate fix in `src/app/tenants/page.tsx`.

- [ ] **Step 6: Manual verify**

Run: `pnpm dev`, insert an invite via the API (or `/settings/observers` after Task 8), open the accept URL logged by the email no-op, sign up as a second user, accept.
Expected: `tenant_member` row with `role='observer'`, redirect target `/observe` (404 until Task 9 — row + redirect are the check here).

- [ ] **Step 7: Commit**

```bash
git add src/app/accept-invite/ src/app/api/observers/accept/ src/proxy.ts src/lib/tenancy/sync-user.ts src/app/api/tenants/switch/route.ts src/app/tenants/page.tsx src/app/api/auth/sync/route.ts
git commit -m "feat(observers): accept flow — signup, membership, /observe routing"
```

---

## Task 5: JWT claims — member_role + observer_scope

**Files:**
- Modify: `supabase/functions/jwt-claims/index.ts`

- [ ] **Step 1: Extend the access-token hook**

After resolving `activeTenantId`, look up the membership and add claims:

```ts
let memberRole: string | null = null;
let observerScope: string | null = null;

if (activeTenantId) {
  const { data: member, error: roleErr } = await admin
    .from("tenant_member")
    .select("role, scope")
    .eq("user_id", payload.user_id)
    .eq("tenant_id", activeTenantId)
    .or(`revoked_at.is.null,revoked_at.gt.${new Date().toISOString()}`)
    .maybeSingle();
  if (!roleErr && member) {
    memberRole = member.role;
    observerScope = member.scope;
  }
}

return new Response(
  JSON.stringify({
    claims: {
      ...payload.claims,
      active_tenant_id: activeTenantId,
      member_role: memberRole,
      observer_scope: observerScope,
    },
  }),
  { headers: { "Content-Type": "application/json" } },
);
```

Also change the existing `tenant_member` fallback lookup in this function from `.is("revoked_at", null)` to the same `.or(...)` predicate (cooling-off consistency).

- [ ] **Step 2: Deploy + verify**

Run: `supabase functions deploy jwt-claims`
Then sign in locally, decode the access token (`Buffer.from(token.split('.')[1], 'base64url')`), assert `member_role` and `observer_scope` present.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/jwt-claims/index.ts
git commit -m "feat(observers): member_role + observer_scope JWT claims"
```

---

## Task 6: RLS scope policies (migration 0020)

**Files:**
- Create: `src/lib/db/migrations/0020_observer_scope_policies.sql`

Spec §4.3 rules implemented, exactly and only:
- observers never write (role-based restrictive policies);
- `audit_only`: SELECT denied on `transaction`, `balance_snapshot`;
- `ledger_only`: SELECT denied on `advisor_message` (and `advisor_conversation`) where `visibility = 'owner_private'`;
- `full_read`: everything tenant isolation already allows.

`fraud_signal` / `policy_event` need no scope policy — spec allows all observer scopes to read them, so their tenant-isolation policies (B-EU plan Task 1) suffice.

- [ ] **Step 1: Write migration 0020**

```sql
-- advisor conversation visibility (TRU-BTR-07)
CREATE TYPE conversation_visibility AS ENUM ('owner_private', 'observers_visible');
ALTER TABLE advisor_conversation
  ADD COLUMN visibility conversation_visibility NOT NULL DEFAULT 'owner_private';

-- Observers are read-only: restrictive deny on writes across tenant tables.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'account', 'transaction', 'category', 'categorization_rule',
    'balance_snapshot', 'import_batch', 'import_batch_rejection',
    'budget_target', 'advisor_conversation', 'advisor_message',
    'pending_proposal', 'recurring_subscription', 'recurring_dismissal',
    'goal', 'weekly_debrief', 'observer_invite'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'CREATE POLICY observer_no_insert ON %I AS RESTRICTIVE FOR INSERT TO authenticated
         WITH CHECK (coalesce(auth.jwt() ->> ''member_role'', '''') <> ''observer'')', t);
    EXECUTE format(
      'CREATE POLICY observer_no_update ON %I AS RESTRICTIVE FOR UPDATE TO authenticated
         USING (coalesce(auth.jwt() ->> ''member_role'', '''') <> ''observer'')', t);
    EXECUTE format(
      'CREATE POLICY observer_no_delete ON %I AS RESTRICTIVE FOR DELETE TO authenticated
         USING (coalesce(auth.jwt() ->> ''member_role'', '''') <> ''observer'')', t);
  END LOOP;
END $$;

-- audit_only: no balances, no transactions (spec §4.3)
CREATE POLICY audit_only_no_transactions ON transaction
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (coalesce(auth.jwt() ->> 'observer_scope', '') <> 'audit_only'
         OR coalesce(auth.jwt() ->> 'member_role', '') <> 'observer');
CREATE POLICY audit_only_no_balances ON balance_snapshot
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (coalesce(auth.jwt() ->> 'observer_scope', '') <> 'audit_only'
         OR coalesce(auth.jwt() ->> 'member_role', '') <> 'observer');

-- Observers below full_read see only observers_visible advisor content (spec §4.3)
CREATE POLICY observer_advisor_visibility ON advisor_conversation
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    coalesce(auth.jwt() ->> 'member_role', '') <> 'observer'
    OR coalesce(auth.jwt() ->> 'observer_scope', '') = 'full_read'
    OR visibility = 'observers_visible'
  );
CREATE POLICY observer_advisor_message_visibility ON advisor_message
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    coalesce(auth.jwt() ->> 'member_role', '') <> 'observer'
    OR coalesce(auth.jwt() ->> 'observer_scope', '') = 'full_read'
    OR EXISTS (
      SELECT 1 FROM advisor_conversation c
      WHERE c.id = advisor_message.conversation_id
        AND c.visibility = 'observers_visible'
    )
  );
```

Restrictive policies AND with the existing permissive `tenant_isolation` policies — tenant isolation still applies first.

- [ ] **Step 2: Run migration**

Run: `pnpm db:migrate`
Expected: applies cleanly; `psql "$DATABASE_URL" -c "select polname, polpermissive from pg_policy join pg_class on polrelid = pg_class.oid where relname = 'transaction'"` lists `audit_only_no_transactions` with `polpermissive = f`.

- [ ] **Step 3: SQL-level policy test (fast feedback before the Playwright suite in Task 15)**

Using psql with a forged JWT context:

```bash
psql "$DATABASE_URL" <<'SQL'
BEGIN;
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000000001","active_tenant_id":"00000000-0000-0000-0000-0000000000aa","member_role":"observer","observer_scope":"audit_only"}';
SELECT count(*) FROM transaction;      -- expect 0 rows visible
SELECT count(*) FROM audit_log_v2;     -- expect > 0 (seed data)
ROLLBACK;
SQL
```

Expected: `transaction` count 0 for `audit_only`; `audit_log_v2` readable.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/migrations/0020_observer_scope_policies.sql
git commit -m "feat(observers): restrictive RLS scope policies + advisor visibility column"
```

---

## Task 7: App-layer scope helpers

**Files:**
- Create: `src/lib/observers/scope.ts`
- Modify: `src/lib/auth/guard.ts`
- Test: `tests/unit/observer-scope.test.ts`

Next.js routes read Postgres through a direct Drizzle connection, so RLS alone does not gate them — these helpers are the app-layer enforcement.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { isMembershipActive, scopeAllows } from "@/lib/observers/scope";

describe("isMembershipActive", () => {
  const accepted = new Date("2026-01-01T00:00:00Z");
  it("active when accepted and not revoked", () => {
    expect(isMembershipActive({ acceptedAt: accepted, revokedAt: null })).toBe(true);
  });
  it("inactive when never accepted", () => {
    expect(isMembershipActive({ acceptedAt: null, revokedAt: null })).toBe(false);
  });
  it("active during cooling-off window (revoked_at in future)", () => {
    const future = new Date(Date.now() + 60_000);
    expect(isMembershipActive({ acceptedAt: accepted, revokedAt: future })).toBe(true);
  });
  it("inactive after revoked_at passes", () => {
    const past = new Date(Date.now() - 60_000);
    expect(isMembershipActive({ acceptedAt: accepted, revokedAt: past })).toBe(false);
  });
});

describe("scopeAllows", () => {
  it("full_read allows everything", () => {
    expect(scopeAllows("full_read", "transactions")).toBe(true);
    expect(scopeAllows("full_read", "advisor_private")).toBe(true);
    expect(scopeAllows("full_read", "audit")).toBe(true);
  });
  it("ledger_only: ledger yes, private advisor no", () => {
    expect(scopeAllows("ledger_only", "transactions")).toBe(true);
    expect(scopeAllows("ledger_only", "advisor_private")).toBe(false);
    expect(scopeAllows("ledger_only", "advisor_shared")).toBe(true);
  });
  it("audit_only: audit yes, transactions/balances no", () => {
    expect(scopeAllows("audit_only", "audit")).toBe(true);
    expect(scopeAllows("audit_only", "transactions")).toBe(false);
    expect(scopeAllows("audit_only", "balances")).toBe(false);
    expect(scopeAllows("audit_only", "advisor_private")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/observer-scope.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement scope.ts**

```ts
import { and, count, eq, gt, isNull, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Db } from "@/lib/db/client";
import { getDb } from "@/lib/db/client";
import { tenantMember } from "@/lib/db/schema";
import { appendAudit } from "@/lib/audit/append";
import type { AuthContext } from "@/lib/auth/guard";

export type MemberScope = "full_read" | "ledger_only" | "audit_only";
export type ScopeResource =
  | "transactions"
  | "balances"
  | "audit"
  | "decisions"
  | "advisor_shared"
  | "advisor_private";

export const COOLING_OFF_MS = 72 * 60 * 60 * 1000;

/** Drizzle predicate fragment for "membership currently grants access". */
export const membershipActiveWhere = or(
  isNull(tenantMember.revokedAt),
  gt(tenantMember.revokedAt, sql`now()`),
);

export function isMembershipActive(
  m: { acceptedAt: Date | null; revokedAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (m.acceptedAt === null) return false;
  if (m.revokedAt !== null && m.revokedAt.getTime() <= now.getTime()) return false;
  return true;
}

const SCOPE_MATRIX: Record<MemberScope, ReadonlySet<ScopeResource>> = {
  full_read: new Set([
    "transactions", "balances", "audit", "decisions", "advisor_shared", "advisor_private",
  ]),
  ledger_only: new Set(["transactions", "balances", "audit", "decisions", "advisor_shared"]),
  audit_only: new Set(["audit", "decisions"]),
};

export function scopeAllows(scope: MemberScope, resource: ScopeResource): boolean {
  return SCOPE_MATRIX[scope].has(resource);
}

export interface Membership {
  role: "owner" | "observer";
  scope: MemberScope;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

export async function getMembership(
  db: Db,
  tenantId: string,
  userId: string,
): Promise<Membership | null> {
  const row = await db.query.tenantMember.findFirst({
    where: and(eq(tenantMember.tenantId, tenantId), eq(tenantMember.userId, userId)),
    columns: { role: true, scope: true, acceptedAt: true, revokedAt: true },
  });
  if (!row || !isMembershipActive(row)) return null;
  return row;
}

/** 403 response when ctx user is not the tenant owner; null when allowed. */
export async function requireOwner(ctx: AuthContext): Promise<NextResponse | null> {
  const m = await getMembership(getDb(), ctx.tenantId, ctx.userId);
  if (!m || m.role !== "owner") {
    return NextResponse.json({ error: "owner required" }, { status: 403 });
  }
  return null;
}

export async function activeObserverCount(db: Db, tenantId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(tenantMember)
    .where(
      and(
        eq(tenantMember.tenantId, tenantId),
        eq(tenantMember.role, "observer"),
        sql`${tenantMember.acceptedAt} IS NOT NULL`,
        membershipActiveWhere,
      ),
    );
  return row?.n ?? 0;
}

/** Schedule a 72h cooling-off revoke. Returns null if no active observer found. */
export async function scheduleObserverRevoke(
  db: Db,
  params: { tenantId: string; observerUserId: string; actorUserId: string },
): Promise<{ effectiveAt: Date } | null> {
  const m = await getMembership(db, params.tenantId, params.observerUserId);
  if (!m || m.role !== "observer") return null;

  const effectiveAt = new Date(Date.now() + COOLING_OFF_MS);
  await db
    .update(tenantMember)
    .set({ revokedAt: effectiveAt })
    .where(
      and(
        eq(tenantMember.tenantId, params.tenantId),
        eq(tenantMember.userId, params.observerUserId),
      ),
    );
  await appendAudit(db, {
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    action: "observer.revoke_scheduled",
    targetType: "tenant_member",
    targetId: params.observerUserId,
    after: { effectiveAt: effectiveAt.toISOString() },
  });
  return { effectiveAt };
}
```

(Observer notification email on revoke is wired in Task 13, which extends `scheduleObserverRevoke`'s caller.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/observer-scope.test.ts`
Expected: PASS.

- [ ] **Step 5: Extend AuthContext**

In `src/lib/auth/guard.ts`, extend the type and populate from `getMembership`:

```ts
export type AuthContext = {
  tenantId: string;
  userId: string;
  role: "owner" | "observer";
  scope: "full_read" | "ledger_only" | "audit_only";
};
```

In `getAuthContext`, after resolving `userId`, call `getMembership(getDb(), tenantId, userId)`; return null when no active membership; otherwise include `role` and `scope`. Existing owner flows keep working (owners are `full_read`). Fix any call sites `pnpm typecheck` flags.

- [ ] **Step 6: Typecheck + full unit suite**

Run: `pnpm typecheck && pnpm vitest run`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/observers/scope.ts src/lib/auth/guard.ts tests/unit/observer-scope.test.ts
git commit -m "feat(observers): app-layer scope enforcement + AuthContext role/scope"
```

---

## Task 8: `/settings/observers` owner UI

**Files:**
- Create: `src/app/settings/observers/page.tsx`
- Create: `src/app/settings/observers/observers-client.tsx`
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: Server page**

`page.tsx`: `requirePageAuth()`; redirect to `/observe` if `ctx.role === "observer"`. Fetch three lists with Drizzle (same queries as the GET route in Task 3): active observers (join `user` for email — Supabase auth email lives in `auth.users`; fetch via `createServerClient().auth.admin` is not available with anon key, so store nothing new: show invite email from the matching accepted `observer_invite` row, joined on `accepted_user_id`), pending invites, scheduled revokes (`revoked_at > now()`). Pass to client component.

- [ ] **Step 2: Client component**

`observers-client.tsx` sections, styled like the existing settings cards (`border-[#4A2E1A] bg-[#3A2414]`, text `#F7F4EE`/`#C4B8A8`):

1. **Active observers** — email, scope badge, accepted date; scope `<select>` (PATCH `/api/observers/[userId]` on change); Revoke button.
2. **Revoke confirm dialog** — copy per spec §4.4: *"Your observer will be notified immediately. Their access ends in 72 hours — this delay protects against coerced removal."* Confirm → DELETE `/api/observers/[userId]` → show "Access ends {effectiveAt}".
3. **Pending invites** — email, scope, expires-at, Cancel button (DELETE `/api/observers/[inviteId]`).
4. **Invite form** — email input + scope selector with the three scope descriptions from Task 4's `SCOPE_LABELS` + Send button (POST `/api/observers`).
5. **Pending revokes** — "Access ends in Nh" countdown text.

Use `router.refresh()` after each mutation; inline error text on non-2xx.

- [ ] **Step 3: Settings index entry**

Add to the `items` array in `src/app/settings/page.tsx`:

```ts
{ href: "/settings/observers", label: "Observers", description: "Invite read-only observers, manage access" },
```

- [ ] **Step 4: Manual verify**

`pnpm dev` → `/settings/observers`: invite → appears in pending; cancel works; (after Task 4 accept) scope edit + revoke show cooling-off messaging.

- [ ] **Step 5: Commit**

```bash
git add src/app/settings/observers/ src/app/settings/page.tsx
git commit -m "feat(observers): /settings/observers owner management UI"
```

---

## Task 9: Observer routes — `/observe`, `/observe/audit`

**Files:**
- Create: `src/app/observe/layout.tsx`
- Create: `src/app/observe/page.tsx`
- Create: `src/app/observe/audit/page.tsx`

- [ ] **Step 1: Observer gate + shell**

```tsx
// src/app/observe/layout.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePageAuth } from "@/app/lib/require-auth";
import { scopeAllows } from "@/lib/observers/scope";

const NAV = [
  { href: "/observe", label: "Overview", resource: "audit" },
  { href: "/observe/audit", label: "Audit log", resource: "audit" },
  { href: "/observe/signals", label: "Signals", resource: "decisions" },
  { href: "/observe/decisions", label: "Decisions", resource: "decisions" },
  { href: "/observe/connections", label: "Connections", resource: "audit" },
] as const;

export default async function ObserveLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageAuth();
  if (ctx.role !== "observer") redirect("/");

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-[#C4B8A8]">
          Read-only observer · <span className="uppercase">{ctx.scope.replace("_", " ")}</span>
        </p>
      </div>
      <nav className="mb-8 flex gap-4 border-b border-[#4A2E1A] pb-3 text-sm">
        {NAV.filter((n) => scopeAllows(ctx.scope, n.resource)).map((n) => (
          <Link key={n.href} href={n.href} className="text-[#C4B8A8] hover:text-[#F7F4EE]">
            {n.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
```

Also update `src/components/nav.tsx`: when the current user is an observer, the owner sidebar links (transactions, wealth, advisor…) are not rendered — observers live in the `/observe` shell. Owners never see `/observe` (layout redirects them out).

- [ ] **Step 2: Landing page**

`/observe/page.tsx` (server component; every query filtered by `ctx.tenantId` **and** gated by `scopeAllows`):

- Tenant name (from `tenant`), scope badge.
- Open fraud signal count — `information_schema`-guarded query (see Task 10 Step 1 helper); show count card linking to `/observe/signals`.
- Last 5 `audit_log_v2` entries: `created_at`, `action`, `actor_user_id`.
- **Pending-revoke banner** (any tenant observer with `revoked_at > now()`): "An observer's access is scheduled to end {date}. If this is unexpected, contact the account owner or another observer." — the spec's "can flag to other observers" surface.

- [ ] **Step 3: Audit viewer**

`/observe/audit/page.tsx` (server component, `searchParams`: `actor`, `action`, `page`):

- Query `audit_log_v2` for the tenant, ordered `id` asc, page size 50 (`limit 50 offset (page-1)*50`).
- **Hash-chain verification badge:** load all rows for the tenant (id asc), map to `ChainRow` (`payload` rebuilt exactly as `appendAudit` builds it: `{ tenantId, actorUserId, action, targetType, targetId, before, after, context }`), call `verifyChain` from `src/lib/audit/hash-chain.ts`. Render `✅ Chain verified · N entries` (green) or `⚠️ Chain broken at entry #brokenAt` (red).
- Filters: `<select>` of distinct actors and distinct actions (two small `selectDistinct` queries), applied via query-string GET form.
- Table columns: timestamp, actor, action, target (`target_type` + `target_id`), and an expandable before/after `<details>` block rendering the JSON.
- Pagination links Prev/Next.

- [ ] **Step 4: Manual verify**

Sign in as the accepted observer → `/observe` renders; `/observe/audit` shows seeded audit entries with a green chain badge. Manually corrupt one row (`psql`: update a `before` field via superuser) → badge flips to broken. Restore afterwards.

- [ ] **Step 5: Commit**

```bash
git add src/app/observe/layout.tsx src/app/observe/page.tsx src/app/observe/audit/page.tsx src/components/nav.tsx
git commit -m "feat(observers): /observe shell, landing, hash-chain-verified audit viewer"
```

---

## Task 10: Observer routes — `/observe/signals`, `/observe/decisions`, `/observe/connections`

**Files:**
- Create: `src/app/observe/signals/page.tsx`
- Create: `src/app/observe/decisions/page.tsx`
- Create: `src/app/observe/connections/page.tsx`
- Create: `src/lib/observers/optional-tables.ts`

These surfaces predate the `fraud_signal` and `connection` tables (Phase B-EU Task 1). Guard with an existence check so this ships first.

- [ ] **Step 1: Optional-table helper**

```ts
// src/lib/observers/optional-tables.ts
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";

export async function tableExists(db: Db, name: "fraud_signal" | "connection"): Promise<boolean> {
  const rows = await db.execute<{ oid: string | null }>(
    sql`select to_regclass(${`public.${name}`}) as oid`,
  );
  return rows[0]?.oid != null;
}
```

- [ ] **Step 2: Signals page**

`/observe/signals/page.tsx`: gate `scopeAllows(ctx.scope, "decisions")` (all scopes pass — signals are observer-visible per spec §2.4). If `!await tableExists(db, "fraud_signal")` → empty state: *"No fraud detectors are running yet. Signals will appear here once live connections and detectors are enabled."* Otherwise `sql` query: open signals (`status = 'open'`) for the tenant, columns detector_id, severity badge (red `high` / yellow `warn` / blue `info`), suggested_action, created_at, evidence rendered as a definition list. Read-only — no actions.

- [ ] **Step 3: Decisions page**

`/observe/decisions/page.tsx` — the accountability ledger, two sections:

1. **Accepted advisor proposals** — `pending_proposal` where `status = 'accepted'` for the tenant, joined to `advisor_message` for context; columns: kind, payload summary, resolved_at.
2. **Dismissed fraud signals** — if `fraud_signal` exists: `status = 'dismissed'` rows with detector_id, dismissed_reason, dismissed_by, created_at. Else section-level empty state.

Page-level empty state when both empty: *"No decisions yet. Accepted advisor proposals and dismissed fraud signals appear here."*

- [ ] **Step 4: Connections page**

`/observe/connections/page.tsx`: if `!await tableExists(db, "connection")` → empty state: *"No live account connections yet. This tenant currently imports data via CSV."* Otherwise list provider, status badge, last_synced_at, last_error (truncated). The "request revoke" button ships with the B-EU connection work (its API doesn't exist yet) — not in this plan.

- [ ] **Step 5: Manual verify**

All three routes render empty states without the B-EU tables; no 500s. `audit_only` observer sees Signals/Decisions but the layout hides nothing extra (spec grants those to every scope).

- [ ] **Step 6: Commit**

```bash
git add src/app/observe/signals/ src/app/observe/decisions/ src/app/observe/connections/ src/lib/observers/optional-tables.ts
git commit -m "feat(observers): signals/decisions/connections observer routes with guarded empty states"
```

---

## Task 11: "Visible to N observers" mutation badges

**Files:**
- Create: `src/components/observer-visibility-badge.tsx`
- Modify: the transaction categorize UI (`src/components/category-picker.tsx` host surface) and advisor proposal accept UI (`src/app/advisor/` proposal card)

- [ ] **Step 1: Badge component**

```tsx
// src/components/observer-visibility-badge.tsx
import { Eye } from "lucide-react";

export function ObserverVisibilityBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-[#4A2E1A] px-2 py-0.5 text-xs text-[#C4B8A8]"
      title="This change is recorded in the audit log your observers can read."
    >
      <Eye size={12} aria-hidden />
      Visible to {count} observer{count === 1 ? "" : "s"}
    </span>
  );
}
```

Count comes from `activeObserverCount(db, tenantId)` (Task 7) fetched in the nearest server component and passed down as a prop — the badge itself stays presentational.

- [ ] **Step 2: Integrate on categorize**

The transactions page server component fetches `activeObserverCount` once and threads it to the row/category-picker UI; render the badge next to the category confirmation affordance.

- [ ] **Step 3: Integrate on advisor proposal accept**

Same pattern on the advisor proposal card: badge next to the Accept button.

- [ ] **Step 4: Fraud-signal dismissal integration point**

The dismiss modal ships in Phase C (TRU-C-06 / TRF-108). Note in that task's PR: reuse `ObserverVisibilityBadge` in the dismiss modal. No code here.

- [ ] **Step 5: Manual verify**

With 0 observers: no badge anywhere. Accept an observer invite → badge reads "Visible to 1 observer" on categorize + proposal accept. Schedule revoke → still counts during 72h window (correct: access continues); after `revoked_at` passes → badge count drops.

- [ ] **Step 6: Commit**

```bash
git add src/components/observer-visibility-badge.tsx src/app/transactions/ src/app/advisor/ src/components/category-picker.tsx
git commit -m "feat(observers): visible-to-N-observers badges on categorize + proposal accept"
```

---

## Task 12: Advisor conversation visibility enforcement

**Files:**
- Modify: `src/app/api/advisor/conversations/route.ts`
- Modify: advisor conversation fetch paths (`src/app/api/advisor/conversations/[id]/route.ts`, list route)

Migration + RLS landed in Tasks 1/6. This task is app-layer behavior.

- [ ] **Step 1: Set visibility on create**

Conversation creation inserts `visibility: "owner_private"` explicitly (schema default matches; explicit insert keeps intent visible). Fraud-related force-to-`observers_visible` arrives with detectors (Phase C, per spec §3.5) — the column and enum are ready; no dead code now.

- [ ] **Step 2: App-layer read filtering for observers**

In every advisor conversation/message read path, when `ctx.role === "observer"`:
- `scope === "audit_only"` → 403 (`scopeAllows(scope, "advisor_shared")` is false);
- `scope === "ledger_only"` → add `eq(advisorConversation.visibility, "observers_visible")` to the where clause;
- `scope === "full_read"` → unfiltered (tenant-scoped as always).

Observers never hit advisor **write** paths: message POST route returns 403 for `ctx.role === "observer"` (detective-only advisor is owner-operated).

- [ ] **Step 3: Unit test the filter decision**

Extend `tests/unit/observer-scope.test.ts`:

```ts
it("ledger_only cannot read advisor_private but can read advisor_shared", () => {
  expect(scopeAllows("ledger_only", "advisor_private")).toBe(false);
  expect(scopeAllows("ledger_only", "advisor_shared")).toBe(true);
});
```

Run: `pnpm vitest run tests/unit/observer-scope.test.ts` — PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/advisor/ tests/unit/observer-scope.test.ts
git commit -m "feat(observers): advisor visibility enforcement for observer scopes"
```

---

## Task 13: 72h cooling-off — notification + banner polish

**Files:**
- Modify: `src/app/api/observers/[id]/route.ts` (DELETE branch)
- Modify: `src/lib/observers/email.ts`

Core mechanics (future-dated `revoked_at`, predicates, audit entry, banner) landed in Tasks 1/4/7/9. This task adds the immediate notification.

- [ ] **Step 1: Revoke-notice email copy**

```ts
export function revokeNoticeEmailText(params: {
  tenantName: string;
  effectiveAt: Date;
}): string {
  return [
    `Your observer access to "${params.tenantName}" on truffe.ai has been scheduled for removal.`,
    ``,
    `Access ends: ${params.effectiveAt.toUTCString()} (72 hours from now).`,
    ``,
    `This delay is a safety feature. If this removal is unexpected — or you believe`,
    `the account owner may be acting under pressure — contact the owner or another`,
    `observer before your access ends. Until then you can still review the audit log.`,
  ].join("\n");
}
```

- [ ] **Step 2: Send on revoke**

In the DELETE handler's member branch, after `scheduleObserverRevoke` succeeds: look up the observer's email (accepted `observer_invite.email` joined on `accepted_user_id`), fetch tenant name, `sendEmail` with the notice. Email failure must not fail the revoke — wrap in try/catch, log via `console.error`.

- [ ] **Step 3: Manual verify**

Revoke an active observer → response `{ coolingOff: true, effectiveAt }` ~72h ahead; email no-op logged in dev; observer still loads `/observe` and sees the pending-revoke banner; `audit_log_v2` has `observer.revoke_scheduled`. Fast-forward check: `psql` set `revoked_at = now() - interval '1 minute'` → observer's next request loses tenant access (redirected to `/login` since no active membership).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/observers/ src/lib/observers/email.ts
git commit -m "feat(observers): 72h cooling-off notification email"
```

---

## Task 14: Daily digest email

**Files:**
- Create: `src/lib/observers/digest.ts`
- Create: `src/app/api/cron/daily-digest/route.ts`
- Test: `tests/unit/observer-digest.test.ts`

Follows the existing cron convention (`POST /api/cron/<name>` + `x-cron-secret`), not a Supabase Edge Function — matches `fx-rates`, `balance-snapshots`, `weekly-debrief`. Schedule externally (Vercel cron / Supabase cron hitting the URL) at 07:00 UTC daily.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { renderDigestText, type DigestData } from "@/lib/observers/digest";

const base: DigestData = {
  tenantName: "Hubert's Wealth",
  since: new Date("2026-07-04T07:00:00Z"),
  newTransactionCount: 12,
  auditEntries: [
    { action: "transaction.categorize", actorLabel: "owner", count: 3 },
    { action: "observer.invite", actorLabel: "owner", count: 1 },
  ],
  newSignals: [{ detectorId: "vendor-bec", severity: "warn", count: 2 }],
  dismissedSignals: [{ detectorId: "vendor-bec", reason: "false_positive", count: 1 }],
  connectionStatus: null, // connection table absent
  pendingRevokes: [],
};

describe("renderDigestText", () => {
  it("owner variant includes all sections", () => {
    const text = renderDigestText(base, "owner");
    expect(text).toContain("12 new transactions");
    expect(text).toContain("vendor-bec");
    expect(text).toContain("dismissed");
  });

  it("audit_only observer variant omits transaction counts, keeps audit + decisions", () => {
    const text = renderDigestText(base, "audit_only");
    expect(text).not.toContain("12 new transactions");
    expect(text).toContain("transaction.categorize");
    expect(text).toContain("dismissed");
  });

  it("skips connection section when connectionStatus is null", () => {
    expect(renderDigestText(base, "owner")).not.toContain("Connections");
  });

  it("hasActivity false when nothing happened", () => {
    const empty: DigestData = {
      ...base,
      newTransactionCount: 0,
      auditEntries: [],
      newSignals: [],
      dismissedSignals: [],
      pendingRevokes: [],
    };
    expect(renderDigestText(empty, "owner")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/observer-digest.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement digest.ts**

```ts
import { and, count, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { auditLogV2, tenant, transaction } from "@/lib/db/schema";
import { tableExists } from "@/lib/observers/optional-tables";
import type { MemberScope } from "@/lib/observers/scope";

export interface DigestData {
  tenantName: string;
  since: Date;
  newTransactionCount: number;
  auditEntries: { action: string; actorLabel: string; count: number }[];
  newSignals: { detectorId: string; severity: string; count: number }[];
  dismissedSignals: { detectorId: string; reason: string; count: number }[];
  connectionStatus: { provider: string; status: string }[] | null;
  pendingRevokes: { effectiveAt: Date }[];
}

export type DigestVariant = "owner" | MemberScope;

/** Collect the last-24h digest inputs for one tenant. */
export async function buildDigestData(db: Db, tenantId: string, since: Date): Promise<DigestData>
// Implementation: one grouped query per section —
//   transactions:  count() where tenant + created_at >= since
//   auditEntries:  group by action (+ synthesized actorLabel owner/observer/system)
//   signals:       information_schema-guarded raw sql on fraud_signal (created_at >= since,
//                  grouped by detector_id, severity; dismissed split by status change)
//   connections:   guarded raw sql on connection (provider, status), null when table absent
//   pendingRevokes: tenant_member where revoked_at > now()

/**
 * Plain-text digest. Returns null when there is no activity (skip send).
 * Variant rules (spec §4.4 + §4.3 scopes):
 *   owner       — everything
 *   full_read   — everything
 *   ledger_only — everything except advisor-private detail (digest carries none anyway)
 *   audit_only  — omit newTransactionCount and connectionStatus (balance-adjacent);
 *                 keep auditEntries, signals, dismissedSignals, pendingRevokes
 */
export function renderDigestText(data: DigestData, variant: DigestVariant): string | null
```

Write both function bodies in full — `renderDigestText` builds the section strings (`What happened`, `Flagged`, `Decided`, `Connections`, `Access changes`) and joins non-empty ones; returns null when every section is empty.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/observer-digest.test.ts`
Expected: PASS.

- [ ] **Step 5: Cron route**

```ts
// src/app/api/cron/daily-digest/route.ts
import { NextResponse } from "next/server";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { observerInvite, tenant, tenantMember } from "@/lib/db/schema";
import { buildDigestData, renderDigestText } from "@/lib/observers/digest";
import { sendEmail } from "@/lib/observers/email";
import { membershipActiveWhere } from "@/lib/observers/scope";
import { env } from "@/env";

function isAuthorized(req: Request): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("x-cron-secret") === secret;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const tenants = await db.select({ id: tenant.id }).from(tenant);
  let sent = 0;

  for (const t of tenants) {
    const data = await buildDigestData(db, t.id, since);
    // Recipients: owner email (ADMIN_EMAIL for the founder tenant at this phase)
    // + each active observer's invite email, with their scope as variant.
    const observers = await db
      .select({ scope: tenantMember.scope, email: observerInvite.email })
      .from(tenantMember)
      .innerJoin(observerInvite, eq(observerInvite.acceptedUserId, tenantMember.userId))
      .where(
        and(
          eq(tenantMember.tenantId, t.id),
          eq(tenantMember.role, "observer"),
          isNotNull(tenantMember.acceptedAt),
          membershipActiveWhere,
        ),
      );

    const ownerText = renderDigestText(data, "owner");
    if (ownerText && process.env.ADMIN_EMAIL) {
      await sendEmail({
        to: process.env.ADMIN_EMAIL,
        subject: `truffe.ai daily digest — ${data.tenantName}`,
        text: ownerText,
      });
      sent++;
    }
    for (const o of observers) {
      const text = renderDigestText(data, o.scope);
      if (!text) continue;
      await sendEmail({
        to: o.email,
        subject: `truffe.ai daily digest — ${data.tenantName}`,
        text,
      });
      sent++;
    }
  }
  return NextResponse.json({ ok: true, sent });
}
```

(Owner email routing is `ADMIN_EMAIL` at this phase — the app has no per-owner email column; multi-owner routing arrives with real multi-tenant signup. Documented limitation, matches single-dogfood-tenant reality.)

- [ ] **Step 6: Integration verify**

Seed activity (categorize a transaction, invite an observer) → `curl -X POST -H "x-cron-secret: $CRON_SECRET" localhost:3000/api/cron/daily-digest` → `{ ok: true, sent: N }`, `[email:skipped]` lines list owner + observer with different bodies. Second immediate run with no new activity → `sent: 0`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/observers/digest.ts src/app/api/cron/daily-digest/ tests/unit/observer-digest.test.ts
git commit -m "feat(observers): daily digest email — owner + per-scope observer variants"
```

---

## Task 15: E2E — invite → audit log → denied private advisor

**Files:**
- Create: `tests/e2e/observer-invite.spec.ts`
- Create: `tests/e2e/observer-rls.spec.ts`

- [ ] **Step 1: observer-invite.spec.ts**

Flow (Playwright, follows patterns in `tests/e2e/multi-tenant-isolation.spec.ts` for multi-user setup):

1. Owner signs in → `/settings/observers` → invites `observer-e2e@example.com` with scope `ledger_only` → assert it appears under pending invites.
2. Obtain the accept token: the raw token is never stored (only its hash) and the email is a dev no-op, so the UI path can't surface it to the test. The fixture generates a token itself — import `generateInviteToken()` into the spec, insert an `observer_invite` row (with `tokenHash`) through the test DB connection used by the existing e2e fixtures. This covers everything except the email transport, which Task 14 unit-covers.
3. Second browser context: sign up as the observer → open `/accept-invite?token=…` → accept → assert redirect lands on `/observe`.
4. Assert `/observe/audit` renders rows and the chain badge shows "Chain verified".
5. Assert the owner's `/settings/observers` now lists the active observer.

- [ ] **Step 2: observer-rls.spec.ts — adversarial scope checks**

Seed three observers (one per scope) via DB fixtures, then per scope:

- `audit_only`: GET `/api/transactions` (or the transactions page data route) → 403/empty; `/observe/audit` → 200 with rows.
- `ledger_only`: advisor conversations API → only `observers_visible` conversations returned; direct GET of an `owner_private` conversation id → 404/403; transactions readable.
- `full_read`: owner-private conversation readable; still cannot POST (categorize attempt → 403).
- All scopes: POST `/api/observers` as observer → 403 (owner-only); POST advisor message → 403.
- Cooling-off: set observer `revoked_at = now() + interval '71 hours'` → access still works; set to `now() - 1 minute` → next navigation redirects to `/login`.

- [ ] **Step 3: Run the suites**

Run: `pnpm test:e2e -- tests/e2e/observer-invite.spec.ts tests/e2e/observer-rls.spec.ts`
Expected: PASS.

- [ ] **Step 4: Full gate**

Run: `pnpm typecheck && pnpm vitest run && pnpm test:e2e`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/observer-invite.spec.ts tests/e2e/observer-rls.spec.ts
git commit -m "test(observers): e2e invite flow + adversarial scope checks"
```

---

## Exit criteria

Phase B-Trust is complete when:

- [ ] Owner invites an observer from `/settings/observers`; signed single-use link (7-day expiry) is emailed; pending invites are cancellable.
- [ ] Observer signs up with their own auth, accepts, and lands on `/observe`.
- [ ] `/observe/audit` renders the tenant audit log with a working hash-chain verification badge, actor/action filters, and pagination.
- [ ] `/observe/signals`, `/observe/decisions`, `/observe/connections` render (empty states until B-EU tables exist).
- [ ] All three scopes enforced at app layer **and** RLS: `audit_only` denied on transactions/balances; `ledger_only` denied on owner-private advisor content; observers denied on every write path.
- [ ] Revoking an active observer schedules removal at +72h, notifies the observer immediately, and access genuinely persists until then and ends after.
- [ ] "Visible to N observers" badge appears on categorize and proposal-accept when observer count > 0.
- [ ] Daily digest sends owner + per-scope observer variants; skips when no activity.
- [ ] `pnpm typecheck`, `pnpm vitest run`, `pnpm test:e2e` all pass in CI.

## What this plan does NOT cover

- Fraud detectors, `fraud_signal` table, signal dismiss flow → Phase B-EU / Phase C plans.
- `connection` table + connection revoke-request from observers → Phase B-EU.
- Forcing fraud-related advisor conversations to `observers_visible` → Phase C (detectors must exist).
- Audit log signed-JSON export → Phase C.
- Panic gesture, real-time observer feed (Supabase Realtime), multi-tenant observer picker on `/observe` → v2 (spec defers; single-tenant observers see their one tenant).
- Passkey-specific accept UX — accept uses the standard auth flow; passkey enrollment is whatever `/login` offers (spec's open item on Supabase WebAuthn maturity is a Phase A concern).
