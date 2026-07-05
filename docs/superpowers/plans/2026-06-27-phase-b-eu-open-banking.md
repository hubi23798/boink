# Phase B-EU — Open Banking + Observer Model + First Detectors

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real HNW user can connect 5+ accounts via TrueLayer EU aggregator, invite spouse/accountant as observer, and receive first fraud-detector signals (vendor-bec + subscription-trap). Observer routes, connection management UI, and daily digest email shipped. Advisor refusal policy v1 hardcoded.

**Architecture:** New `connection` table stores aggregator linkage; access tokens stored in Supabase Vault (KMS-backed). TrueLayer OAuth flow server-side only; token never returned to client. Sync runs as Supabase Edge Function on 6h cron with exponential backoff. Observer model: `tenant_member` rows with `scope` enum enforced via second RLS policy. Fraud detectors plug into a `Detector` interface, run post-ingest and on nightly batch re-scan. Each produces `fraud_signal` rows (append-only, observer-visible). Advisor refusal policy baked into system prompt + output filter; refusals logged to `policy_event`. Daily digest email via Resend to owner + each observer.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Drizzle ORM 0.45, Postgres (Supabase), Supabase Vault, Supabase Edge Functions (Deno), TrueLayer Data API v1, Tink (backup), Resend, Vitest, Playwright. Existing engines untouched.

**Spec:** `docs/superpowers/specs/2026-06-27-hnw-fraud-spine-design.md` §5 Phase B.

**Aggregator spike outcome:** See Task 0 below (TRU-BEU-00). TrueLayer chosen as primary; Tink as backup.

**Out of scope for this plan:** crypto-outflow-scam detector (Phase C), Plaid US integration (Phase C), audit log export (Phase C), BYOK (Family Office tier, Phase D), real-time push alerts (Phase D), mutation-proposal pipeline.

**Prerequisites:** Phase A complete (tenant + RLS + Supabase Auth + audit_log_v2 running in production).

---

## Aggregator Spike Outcome (TRU-BEU-00)

> Research completed 2026-06-30. Full comparison below. **Decision: TrueLayer primary, Tink backup.**

### TrueLayer vs Tink — Comparison Matrix

| Dimension                     | TrueLayer                                                                                   | Tink                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **UK coverage**               | Excellent — 99%+ major banks (Barclays, HSBC, Lloyds, NatWest, Monzo, Starling, Revolut UK) | Good — FCA-authorised, main banks covered, slightly thinner long-tail   |
| **Ireland coverage**          | Good — AIB, Bank of Ireland, Ulster Bank, Revolut IE                                        | Good — comparable IE coverage                                           |
| **France coverage**           | Good — BNP, Société Générale, Crédit Agricole, Revolut FR                                   | Excellent — deepest FR coverage of any PSD2 aggregator                  |
| **Germany coverage**          | Good — Deutsche, Commerzbank, N26, Revolut DE                                               | Excellent — strongest DE coverage; ING, Sparkasse long-tail             |
| **Netherlands coverage**      | Good — ING, ABN AMRO, Rabobank                                                              | Excellent — broadest NL coverage                                        |
| **Revolut (EU)**              | ✅ Full (IE, FR, DE, NL)                                                                    | ✅ Full                                                                 |
| **Revolut (UK)**              | ✅ Full                                                                                     | ✅ Full                                                                 |
| **Transaction history depth** | 90 days standard; up to 24 months on supported banks                                        | 90 days standard; varies by bank                                        |
| **Pending transactions**      | ✅ Supported                                                                                | ✅ Supported                                                            |
| **Webhooks**                  | JWS-signed (JSON Web Signature, RS256 or PS256)                                             | HMAC-SHA256 signed                                                      |
| **Sandbox DX**                | Excellent — full OAuth flow testable, simulated accounts, fast key provisioning             | Good — more onboarding steps; sandbox covers all major bank simulations |
| **Pricing model**             | Per-API-call (~€0.10–0.20/connection/mo at truffe.ai sync cadence)                          | Per-consent (~€0.15–0.30/connection/mo)                                 |
| **PSD2 licence**              | FCA Authorised Payment Institution + EU agent passporting                                   | Finansinspektionen (Sweden) + EU passporting; Visa subsidiary           |
| **Enterprise backing**        | Independent (raised ~$70M); UK-headquartered                                                | Visa subsidiary since 2022; larger enterprise trust signal              |
| **HQ**                        | London                                                                                      | Stockholm                                                               |
| **SDK / client libs**         | Official Node.js SDK + REST                                                                 | Official Node.js SDK + REST                                             |
| **Token refresh**             | Server-side refresh with re-consent flow on expiry                                          | Server-side refresh; re-consent on expiry                               |
| **Rate limits**               | Per-application limits; documented in dashboard                                             | Per-application; configurable                                           |

### Decision rationale

**Primary: TrueLayer**

- EU beachhead is London/Dublin (spec §6.3 geo order). TrueLayer's UK coverage is best-in-class — no other PSD2 aggregator matches it on UK bank breadth.
- London/Dublin HNW persona uses Revolut, Monzo, Starling, HSBC, Barclays — all TrueLayer Tier 1.
- JWS webhook signature is more widely documented and has more reference implementations than Tink HMAC.
- Sandbox DX is faster for Phase B development iteration.
- UK-headquartered: easier enterprise/commercial contract negotiation for London outreach.

**Backup: Tink**

- DE/NL/FR HNW accounts where TrueLayer coverage has gaps.
- Visa backing provides additional enterprise trust signal for Family Office tier.
- Pluggable `Source` interface means Tink adapter can be added without restructuring TrueLayer adapter.
- Tink webhook verification (HMAC) implemented separately from TrueLayer (JWS); both handler paths needed for multi-provider support.

**Deferred: Plaid**

- US only; Phase C. Architecture wired but not user-facing in Phase B.

---

## File Structure

**New files:**

```
src/lib/aggregators/
  interface.ts                        -- Source interface + AggregatorToken types
  truelayer/
    client.ts                         -- TrueLayer API client (token refresh, account/txn fetch)
    oauth.ts                          -- OAuth flow: auth URL builder, callback handler, token exchange
    webhook.ts                        -- JWS signature verification
    sync.ts                           -- Sync runner: fetch accounts + transactions, upsert via Source interface
  tink/
    client.ts                         -- Tink API client (stub; full impl when needed)
    webhook.ts                        -- HMAC verification (stub)

src/lib/fraud/
  interface.ts                        -- Detector interface + FraudSignal type
  runner.ts                           -- runDetectors(ctx, transactions[]) → FraudSignal[]
  vendor-bec/
    detector.ts                       -- Net-new payee + anomaly + urgency-scan + address-mismatch
    heuristics.ts                     -- Pure functions: isNewPayee, amountAnomaly, urgencyLanguageScan
  subscription-trap/
    detector.ts                       -- Price-hike + post-trial + double-billing detection
    heuristics.ts                     -- Pure functions: priceHikeDetect, postTrialConvert, doubleBilling

src/lib/observers/
  invite.ts                           -- Signed invite link generation + verification
  digest.ts                           -- Daily digest email builder (owner + observer variants)
  scope.ts                            -- Scope enforcement helpers (assertScope)

src/lib/policy/
  refusals.ts                         -- Refusal category enum + policy_event writer
  output-filter.ts                    -- Post-LLM output filter: ticker scrub + disclaimer + refusal check

supabase/functions/
  sync-connections/
    index.ts                          -- Edge Function: fan-out sync for all active connections (6h cron)
  daily-digest/
    index.ts                          -- Edge Function: build + send daily digest email (nightly cron)

src/app/
  settings/connections/
    page.tsx                          -- Owner: connection list + add + status + manual resync + revoke
  settings/observers/
    page.tsx                          -- Owner: invite observer + scope + revoke list
  observe/
    layout.tsx                        -- Observer shell (scope gate)
    page.tsx                          -- Observer landing dashboard
    audit/page.tsx                    -- Hash-chain-verified audit log viewer
    signals/page.tsx                  -- Open fraud signals (observer-visible)
    decisions/page.tsx                -- Accepted proposals + dismissed signals
  api/
    aggregators/truelayer/
      connect/route.ts                -- Start OAuth: build auth URL + store PKCE state
      callback/route.ts               -- Exchange code → token → store in Vault → create connection row
      webhook/route.ts                -- Receive + verify TrueLayer webhook → trigger incremental sync
    aggregators/tink/
      webhook/route.ts                -- Stub: HMAC verify + incremental sync (wired, not user-facing)
    connections/
      [id]/route.ts                   -- GET status, DELETE (revoke)
      [id]/resync/route.ts            -- POST manual resync trigger
    observers/
      invite/route.ts                 -- POST: create invite + send signed email link
      [id]/route.ts                   -- DELETE (revoke observer)
    fraud/
      signals/route.ts                -- GET signals for tenant (owner + observers)
      signals/[id]/dismiss/route.ts   -- POST dismiss with reason

src/lib/db/migrations/
  0015_connection.sql                 -- connection table + provider enum + status enum
  0016_fraud_signal.sql               -- fraud_signal table
  0017_policy_event.sql               -- policy_event table
  0018_advisor_visibility.sql         -- advisor_conversation.visibility column

tests/
  unit/
    aggregators/truelayer-oauth.test.ts
    aggregators/truelayer-webhook-jws.test.ts
    fraud/vendor-bec.test.ts          -- 20+ fixtures: new payee, amount anomaly, urgency, address mismatch
    fraud/subscription-trap.test.ts   -- 15+ fixtures: price hike, post-trial, double-billing
    policy/output-filter.test.ts
  e2e/
    connection-flow.spec.ts           -- TrueLayer OAuth happy path + error path (sandbox)
    observer-invite.spec.ts           -- Observer invite → accept → scope check
    observer-rls.spec.ts              -- Adversarial: observer attempts SELECT on owner-private convos
    fraud-signal-flow.spec.ts         -- Ingest transaction → detector fires → signal visible in UI
```

**Modified files:**

- `src/lib/advisor/system-prompt.ts` — refusal policy baked in (done: TRF-114).
- `src/lib/db/schema.ts` — add `connection`, `fraudSignal`, `policyEvent` tables; add `visibility` to `advisorConversation`.
- `src/app/api/advisor/route.ts` — pipe responses through `output-filter.ts`; log refusals to `policy_event`.
- `.env.example` — `TRUELAYER_CLIENT_ID`, `TRUELAYER_CLIENT_SECRET`, `TINK_CLIENT_ID`, `TINK_CLIENT_SECRET`, `RESEND_API_KEY`.
- `src/proxy.ts` — no changes needed (RLS enforces isolation; public paths already updated).

---

## Task 0: Aggregator spike (TRU-BEU-00)

**Status: DONE** — See spike outcome section above. TrueLayer primary, Tink backup. Decision recorded in this plan.

---

## Task 1: DB migrations — connection + fraud tables

**Files:**

- Create: `src/lib/db/migrations/0015_connection.sql`
- Create: `src/lib/db/migrations/0016_fraud_signal.sql`
- Create: `src/lib/db/migrations/0017_policy_event.sql`
- Create: `src/lib/db/migrations/0018_advisor_visibility.sql`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Write migration 0015 — connection table**

```sql
create type provider_enum as enum ('truelayer', 'tink', 'plaid', 'manual', 'csv');
create type connection_status as enum ('active', 'error', 'revoked', 'paused');

create table connection (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  provider provider_enum not null,
  provider_item_id text not null,
  access_token_ref text not null, -- Supabase Vault secret name, never raw token
  status connection_status not null default 'active',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index connection_tenant_idx on connection(tenant_id);
alter table connection enable row level security;
create policy connection_tenant_isolation on connection
  for all using (tenant_id = (auth.jwt() ->> 'active_tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'active_tenant_id')::uuid);
```

- [ ] **Step 2: Write migration 0016 — fraud_signal table**

```sql
create type signal_severity as enum ('info', 'warn', 'high');
create type signal_status as enum ('open', 'dismissed', 'acknowledged', 'escalated');

create table fraud_signal (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  detector_id text not null,
  transaction_id uuid references transaction(id),
  severity signal_severity not null,
  evidence jsonb not null,
  suggested_action text not null,
  status signal_status not null default 'open',
  dismissed_by uuid references "user"(id),
  dismissed_reason text,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index fraud_signal_tenant_idx on fraud_signal(tenant_id, status);
alter table fraud_signal enable row level security;
create policy fraud_signal_tenant_isolation on fraud_signal
  for all using (tenant_id = (auth.jwt() ->> 'active_tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'active_tenant_id')::uuid);
```

- [ ] **Step 3: Write migration 0017 — policy_event and 0018 — advisor visibility**

See schema in spec §4.1. Follow same RLS pattern.

- [ ] **Step 4: Add Drizzle schema definitions for all new tables**

- [ ] **Step 5: Run migrations against local Supabase; verify RLS blocks cross-tenant reads**

```bash
npx drizzle-kit migrate
npx supabase db reset --local  # verify seed still works
```

---

## Task 2: Supabase Vault setup for aggregator tokens

**Files:**

- Create: `src/lib/aggregators/vault.ts`

- [ ] **Step 1: Write vault.ts wrapper**

```ts
// Thin wrapper: store/retrieve aggregator tokens by secret name.
// Never returns raw token to client — Edge Function only.
export async function storeToken(secretName: string, token: string): Promise<void>;
export async function retrieveToken(secretName: string): Promise<string>;
export async function deleteToken(secretName: string): Promise<void>;
```

Use `supabase.rpc('vault.create_secret', ...)` and `vault.decrypted_secrets` view.
Token is never logged — enforce via `src/lib/logging/redact.ts` pattern.

- [ ] **Step 2: Unit test vault wrapper with mock Supabase client**

---

## Task 3: TrueLayer OAuth flow

**Files:**

- Create: `src/lib/aggregators/truelayer/oauth.ts`
- Create: `src/app/api/aggregators/truelayer/connect/route.ts`
- Create: `src/app/api/aggregators/truelayer/callback/route.ts`

- [ ] **Step 1: Build auth URL**

```ts
// oauth.ts
export function buildAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string; // HMAC-signed per-session nonce
  scopes: string[]; // ['accounts', 'transactions', 'balance']
}): string;
```

State parameter: `HMAC-SHA256(sessionId + timestamp)` — verified in callback to prevent CSRF.

- [ ] **Step 2: Implement connect route**

`POST /api/aggregators/truelayer/connect` — generate state nonce, store in session, return redirect URL. Rate limit: max 3 new connections per tenant per hour.

- [ ] **Step 3: Implement callback route**

`GET /api/aggregators/truelayer/callback` — verify state, exchange code for tokens, store in Vault, create `connection` row, trigger first sync.

- [ ] **Step 4: Unit test OAuth flow with mocked TrueLayer responses**

- [ ] **Step 5: Adversarial test: replay state nonce → rejected**

---

## Task 4: TrueLayer sync runner

**Files:**

- Create: `src/lib/aggregators/truelayer/client.ts`
- Create: `src/lib/aggregators/truelayer/sync.ts`
- Create: `supabase/functions/sync-connections/index.ts`

- [ ] **Step 1: TrueLayer API client**

Implement `getAccounts`, `getTransactions(accountId, from, to)`, `getBalance(accountId)`. Token refresh: if 401, use refresh token → update Vault → retry once. On refresh failure: set `connection.status = 'error'`, write to `audit_log_v2`, notify owner.

- [ ] **Step 2: Sync runner**

```ts
export async function syncConnection(connectionId: string): Promise<SyncResult>;
```

Flow: retrieve token from Vault → fetch accounts → upsert `account` rows → fetch transactions (since `last_synced_at`) → upsert `transaction` rows → run fraud detectors on new transactions → update `connection.last_synced_at`.

All upserts via service-role context (bypasses RLS per `src/lib/tenancy/service-role.ts` pattern).

- [ ] **Step 3: Edge Function cron (6h)**

```ts
// supabase/functions/sync-connections/index.ts
// Fan-out: SELECT all active connections → invoke syncConnection() per connection.
// Exponential backoff on error: 5min → 15min → 45min → mark error.
```

- [ ] **Step 4: Manual resync route**

`POST /api/connections/[id]/resync` — owner-triggered; respects rate limit (max 1 manual resync per connection per 15min).

- [ ] **Step 5: Integration test against TrueLayer sandbox**

Run with sandbox credentials. Assert: accounts appear, transactions import, `last_synced_at` updated, second run is idempotent (no duplicate transactions).

---

## Task 5: TrueLayer webhook verification

**Files:**

- Create: `src/lib/aggregators/truelayer/webhook.ts`
- Create: `src/app/api/aggregators/truelayer/webhook/route.ts`

- [ ] **Step 1: JWS verification**

```ts
export async function verifyTrueLayerWebhook(
  body: string,
  jwsHeader: string,
  jwksUri: string,
): Promise<boolean>;
```

Fetch TrueLayer JWKS from their public endpoint. Cache with 5-min TTL. Verify RS256/PS256 signature. Reject if timestamp in JWS header > 5 min old (replay protection).

- [ ] **Step 2: Webhook handler**

Parse event type (`transaction.created`, `account.status_updated`). Trigger incremental sync for affected connection. Return 200 immediately; process async.

- [ ] **Step 3: Unit test: valid JWS → accepted; tampered body → rejected; replayed timestamp → rejected**

---

## Task 6: Connection management UI

**Files:**

- Create: `src/app/settings/connections/page.tsx`
- Create: `src/app/api/connections/[id]/route.ts`

- [ ] **Step 1: Connections list page**

Show per connection: provider name + icon, last-synced timestamp, status badge (active/error/paused/revoked), account count, manual resync button. Empty state: "No accounts connected — add your first connection."

- [ ] **Step 2: Add connection flow**

"Add account" → provider picker (TrueLayer for UK/EU, Tink for continental gaps) → redirect to OAuth. On return: show success + first sync in progress.

- [ ] **Step 3: Revoke flow**

"Remove" → confirm dialog → POST to `/api/connections/[id]` DELETE → Vault token deleted → `connection.status = revoked` → audit log entry.

- [ ] **Step 4: Error state UI**

If `connection.status = error`: show "Reconnect" CTA → re-initiates OAuth. Show `last_error` truncated + "synced N hours ago."

---

## Task 7: Observer invite + scope model

**Files:**

- Create: `src/lib/observers/invite.ts`
- Create: `src/app/settings/observers/page.tsx`
- Create: `src/app/api/observers/invite/route.ts`
- Create: `src/app/api/observers/[id]/route.ts`

- [ ] **Step 1: Signed invite link**

```ts
export function buildInviteToken(params: {
  tenantId: string;
  invitedByUserId: string;
  scope: "full_read" | "ledger_only" | "audit_only";
  expiresAt: Date; // 7 days
}): string; // HMAC-signed JWT
export function verifyInviteToken(token: string): InvitePayload | null;
```

- [ ] **Step 2: Invite flow**

Owner inputs email + scope → API creates `tenant_member` row (`accepted_at = null`) → sends invite email (Resend) with link `/accept-invite?token=<signed>`. Observer clicks → Supabase Auth sign-up/sign-in → `accepted_at = now()`. RLS immediately applies for their scope.

- [ ] **Step 3: Observer list UI**

Show per observer: email, scope, last-active, status (pending/active/revoked). Scope-edit dropdown. Revoke button with 72h cooling-off note.

- [ ] **Step 4: 72h cooling-off on revoke**

On revoke: set `revoked_at = now() + 72h` (not immediate). Observer notified by email of pending revoke. Can flag to other observers during window. Audit log entry written immediately.

- [ ] **Step 5: RLS adversarial tests**

```ts
// tests/e2e/observer-rls.spec.ts
// audit_only observer: assert cannot SELECT transaction rows
// ledger_only observer: assert cannot SELECT advisor_message rows WHERE visibility='owner_private'
// full_read observer: assert can SELECT fraud_signal rows
```

---

## Task 8: Observer routes

**Files:**

- Create: `src/app/observe/layout.tsx`
- Create: `src/app/observe/page.tsx`
- Create: `src/app/observe/audit/page.tsx`
- Create: `src/app/observe/signals/page.tsx`
- Create: `src/app/observe/decisions/page.tsx`

- [ ] **Step 1: Observer layout shell**

Gate: confirm requesting user has a `tenant_member` row with `accepted_at IS NOT NULL` and `revoked_at IS NULL`. Redirect to `/login` if not.

- [ ] **Step 2: Observer landing**

Show: tenant name, owner name, scope badge, last-sync timestamp, open signal count, recent audit entries (last 5).

- [ ] **Step 3: Audit log viewer (`/observe/audit`)**

Chronological; filterable by actor + action type. Hash-chain verification badge (✅ chain intact / ⚠️ chain broken). Paginated (50/page).

- [ ] **Step 4: Signals page (`/observe/signals`)**

Open fraud signals, observer-visible. Show: detector name, severity badge, evidence summary, created timestamp, dismissal status. Read-only for observers.

- [ ] **Step 5: Decisions page (`/observe/decisions`)**

Dismissed fraud signals (with dismiss reason + who dismissed) + any accepted advisor proposals. The accountability ledger.

---

## Task 9: Fraud detector — vendor-bec

**Files:**

- Create: `src/lib/fraud/interface.ts`
- Create: `src/lib/fraud/runner.ts`
- Create: `src/lib/fraud/vendor-bec/detector.ts`
- Create: `src/lib/fraud/vendor-bec/heuristics.ts`
- Create: `tests/unit/fraud/vendor-bec.test.ts`

- [ ] **Step 1: Detector interface**

```ts
export interface Detector {
  id: string; // 'vendor-bec' | 'subscription-trap' | 'crypto-outflow-scam'
  run(ctx: DetectorCtx, tx: Transaction): Promise<FraudSignal[]>;
}

export interface FraudSignal {
  detectorId: string;
  transactionId: string;
  severity: "info" | "warn" | "high";
  evidence: Record<string, unknown>; // structured, no free text from LLM
  suggestedAction: string;
  expiresAt?: Date;
}
```

- [ ] **Step 2: vendor-bec heuristics (all untrusted-data wrapped)**

```ts
export function isNewPayee(payeeName: string, tenantHistory: string[]): boolean;
export function amountAnomaly(amount: number, vendorHistory: number[]): AnomalyResult;
export function urgencyLanguageScan(memo: string): UrgencyScanResult;
// wraps memo in <user-data> before any LLM call; returns {flagged, matchedTerms}
export function addressMismatch(memoText: string, knownVendorAddress: string | null): boolean;
```

- [ ] **Step 3: detector.ts — compose heuristics into FraudSignal**

Run all four heuristics. If any fires: write `fraud_signal` row. Evidence field: `{ payeeFirstSeenAt, amountVsMedianRatio, urgencyTermsFound, addressMismatch }`. Severity: `high` if 2+ fire, `warn` if 1.

- [ ] **Step 4: 20+ unit test fixtures**

Include: new payee + anomaly amount = high severity; known payee + normal amount = no signal; urgency memo only = warn; address mismatch only = warn; untrusted-data injection attempt in memo = no signal (injection ignored).

---

## Task 10: Fraud detector — subscription-trap

**Files:**

- Create: `src/lib/fraud/subscription-trap/detector.ts`
- Create: `src/lib/fraud/subscription-trap/heuristics.ts`
- Create: `tests/unit/fraud/subscription-trap.test.ts`

- [ ] **Step 1: subscription-trap heuristics**

```ts
export function priceHikeDetect(history: RecurringEntry[]): PriceHikeResult;
// Fire if latest amount > 1.15× median of last 6 months
export function postTrialConversion(history: RecurringEntry[]): PostTrialResult;
// Fire if first charge ≥ 3× preceding charge AND gap ≤ 35 days
export function doubleBilling(txA: Transaction, candidates: Transaction[]): DoubleBillingResult;
// Fire if same merchant + same amount within 7 days across different accounts
```

- [ ] **Step 2: detector.ts**

Evidence field: `{ priceHike: { from, to, percentIncrease }, postTrial: { trialAmount, firstFullAmount }, doubleBilling: { txAId, txBId, accountA, accountB } }`.

- [ ] **Step 3: 15+ unit test fixtures**

---

## Task 11: Fraud runner integration

**Files:**

- Create: `src/lib/fraud/runner.ts`

- [ ] **Step 1: runDetectors**

```ts
export async function runDetectors(
  db: Db,
  tenantId: string,
  transactions: Transaction[],
): Promise<FraudSignal[]>;
```

Fan-out all registered detectors over `transactions`. Deduplicate: if signal for same `(detectorId, transactionId)` already exists with status `open`, skip. Write new signals to `fraud_signal` table. Write to `audit_log_v2`.

- [ ] **Step 2: Hook runner into sync flow (Task 4 Step 2)**

Call `runDetectors` after transaction upsert in `syncConnection`.

- [ ] **Step 3: Nightly batch re-scan Edge Function**

```ts
// supabase/functions/daily-digest/index.ts (or separate function)
// Re-run all detectors on last-30-day transactions for all tenants.
// Reason: detector rules evolve; historical transactions can newly-flag.
```

- [ ] **Step 4: Fraud signal dismiss flow**

`POST /api/fraud/signals/[id]/dismiss` — body: `{ reason: string }`. Set `status = 'dismissed'`, `dismissed_by`, `dismissed_reason`. Write to `audit_log_v2`. Assert observer can see dismissal in `/observe/decisions`.

---

## Task 12: Advisor refusal policy + output filter

**Files:**

- Create: `src/lib/policy/refusals.ts`
- Create: `src/lib/policy/output-filter.ts`
- Modify: `src/app/api/advisor/route.ts`
- Create: `tests/unit/policy/output-filter.test.ts`

- [ ] **Step 1: Refusal catalog**

```ts
export const REFUSAL_CATEGORIES = [
  "securities",
  "tax_evasion",
  "aml",
  "insider",
  "legal",
  "welfare",
  "scam_enablement",
  "cross_tenant",
] as const;

export async function logPolicyEvent(
  db: Db,
  params: {
    tenantId: string;
    userId: string;
    conversationId?: string;
    category: (typeof REFUSAL_CATEGORIES)[number];
    triggerTextHash: Buffer;
    surfacedToObserver: boolean;
  },
): Promise<void>;
```

- [ ] **Step 2: Output filter**

Post-LLM: scrub ticker symbols (regex: `\b[A-Z]{2,5}\b` in financial context), append disclaimer, detect if response quotes untrusted string verbatim above 200 chars (echo-back protection), detect refusal category from system-prompt refusal marker.

- [ ] **Step 3: Wire into advisor route**

- [ ] **Step 4: Adversarial fixture battery (≥ 50 fixtures)**

Include: `</user-data>` break-out, `<system>` injection, base64 encoded instruction in memo, multilingual injection, unicode confusables, instruction in vendor name, instruction in transaction description.

- [ ] **Step 5: Welfare flag handling**

If `category = welfare`: surface crisis line in response (`Samaritans UK: 116 123 · US: 988`); `surfacedToObserver = false` (owner-only); write `policy_event`.

---

## Task 13: Daily digest email

**Files:**

- Create: `src/lib/observers/digest.ts`
- Create: `supabase/functions/daily-digest/index.ts`

- [ ] **Step 1: Digest builder**

Per tenant per day:

- New fraud signals: count + detector breakdown
- Signals dismissed today: who dismissed + reason
- New connections added / revoked
- New observer activity
- Advisor refusals (count only, no trigger text)

Two variants: owner (full) and observer (scoped to their visibility).

- [ ] **Step 2: Resend integration**

Send via Resend transactional API. From: `digest@truffe.ai`. Reply-to: `noreply@truffe.ai`. Template: plain-text first (no HTML at MVP — avoids rendering bugs and is more trustworthy for HNW persona).

- [ ] **Step 3: Edge Function nightly cron**

```ts
// Runs at 07:00 UTC daily.
// For each tenant: build owner digest + per-observer digest → send.
// Skip if no activity since last digest.
```

- [ ] **Step 4: Integration test**

Seed a tenant with signals + dismissals + a connection sync → trigger digest build → assert email payload contains expected fields.

---

## Task 14: `advisor_conversation.visibility` enforcement

**Files:**

- Modify: `src/app/api/advisor/route.ts`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Set visibility on conversation creation**

Default: `owner_private`. If conversation references a `fraud_signal` ID: force `observers_visible`.

- [ ] **Step 2: RLS second policy for advisor_message**

```sql
-- ledger_only observers: deny advisor_message rows where visibility = 'owner_private'
create policy advisor_message_observer_scope on advisor_message
  for select using (
    (auth.jwt() ->> 'observer_scope') != 'ledger_only'
    or (select visibility from advisor_conversation where id = advisor_message.conversation_id) = 'observers_visible'
  );
```

- [ ] **Step 3: Adversarial test: ledger_only observer cannot read owner_private advisor message**

---

## Exit criteria

Phase B-EU is complete when:

- [ ] One beta tenant (Hubert's dogfood account) runs full flow: TrueLayer OAuth → import → categorise → invite observer → receive vendor-bec signal → dismiss with reason → observer sees dismissal in `/observe/decisions`.
- [ ] Observer RLS adversarial tests pass (all three scope levels).
- [ ] JWS webhook signature test: tampered body rejected.
- [ ] Advisor refusal fixture battery (≥ 50 fixtures) passes in CI.
- [ ] Daily digest email renders correctly for owner + observer variant.
- [ ] No new TypeScript errors (`tsc --noEmit` clean).
- [ ] `fraud_signal` rows are append-only (no UPDATE/DELETE in app role).

---

## What this plan does NOT cover

- `crypto-outflow-scam` detector → Phase C.
- Plaid US integration → Phase C (architecture wired in Task 3 pattern, not active).
- Audit log signed-JSON export → Phase C.
- Tink full implementation → Phase C (stub in Phase B).
- BYOK encryption → Phase D (Family Office tier).
- Real-time push alerts → Phase D.
