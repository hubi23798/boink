# Core Loop Design: LLM Categorization + Weekly Debrief

## Goal

Close the active-use gap: transactions flow in via CSV → Claude categorises them automatically → a weekly debrief surfaces what changed and why, with specific flags worth acting on. No user action required beyond importing.

---

## Scope

Two independent subsystems, built in order:

1. **LLM Categorization** — auto-categorise uncategorized transactions at import time using Claude
2. **Weekly Debrief** — scheduled analysis stored in DB, surfaced on the home screen

Revolut Open Banking (real-time connection) and push/email delivery are explicitly out of scope. Deployment to Vercel + Supabase is deferred.

---

## Sub-system 1: LLM Categorization

### Overview

After the existing import pipeline (rules engine → transfer heuristic), any uncategorized transactions are batched to Claude in a single API call. Claude receives the full leaf-category tree and each transaction's description, amount, and currency. All returned suggestions are auto-applied directly to the `transaction.categoryId` field. No review queue in v1 — users correct wrong categories manually.

If the Anthropic call fails for any reason, categorization is skipped silently and the import completes normally. Transactions remain uncategorized for manual review.

### New File: `src/lib/categorization/llm.ts`

Pure function — no side effects, no DB access.

```typescript
interface LlmClassification {
  transactionId: string;
  categoryId: string;
  confidence: number; // 0–1, logged but not used as a gate in v1
}

async function classifyTransactions(
  txns: Array<{
    id: string;
    descriptionRaw: string | null;
    amountNative: number;
    currency: string;
  }>,
  categories: Array<{
    id: string;
    name: string;
    parentName: string;
  }>,
): Promise<LlmClassification[]>;
```

**Prompt design:**

- System prompt: full category list (id, parentName › name) once — eligible for prompt caching
- User message: JSON array of transactions
- Claude returns a JSON array: `[{ transactionId, categoryId, confidence }]`

**Validation before applying:**

- Strip any `categoryId` not present in the provided category list
- Strip entries with missing or non-UUID `categoryId`
- If response is unparseable JSON, return `[]`

**Error handling:**

- Any Anthropic API error → `console.error` + return `[]`
- Parse failure → `console.error` + return `[]`
- Empty `txns` input → return `[]` immediately (no API call)

### Import Pipeline Change: `src/app/api/settings/import/route.ts`

New step after rules + heuristic, before DB insert:

1. Collect transactions still missing `categoryId`
2. If none → skip
3. Fetch all active leaf categories (expense + investment_flow, not archived) from DB
4. Call `classifyTransactions(uncategorized, categories)`
5. Bulk-update `categoryId` on matched transactions
6. Continue with insert as normal

No new DB tables. No schema changes.

### Tests: `tests/unit/categorization-llm.test.ts`

- Valid JSON response → classifications applied correctly
- Unknown `categoryId` in response → filtered out before return
- Anthropic API throws → returns `[]` without throwing
- Malformed JSON response → returns `[]` without throwing
- Empty `txns` array → returns `[]` without calling Anthropic

---

## Sub-system 2: Weekly Debrief

### Overview

A cron-triggered endpoint runs weekly, builds a financial snapshot covering the past 7 days plus comparison data, calls Claude, and stores the structured result in a new `weekly_debrief` table. The home screen shows the latest debrief — narrative text + flag list — in a card above the advisor prompt section.

### DB Schema: `weekly_debrief` table

```typescript
export const weeklyDebrief = pgTable("weekly_debrief", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  weekStart: date("week_start").notNull(), // Monday (UTC)
  weekEnd: date("week_end").notNull(), // Sunday (UTC)
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
  narrativeText: text("narrative_text").notNull(),
  flags: jsonb("flags").$type<DebriefFlag[]>().notNull().default([]),
});

// Unique constraint: one debrief per user per week (enables safe upsert)
// UNIQUE (user_id, week_start)
```

### Flag Schema

```typescript
type DebriefFlag =
  | { kind: "spending_spike"; category: string; changePct: number; message: string }
  | { kind: "spending_drop"; category: string; changePct: number; message: string }
  | { kind: "budget_overrun"; category: string; message: string }
  | { kind: "recurring_due"; name: string; message: string }
  | { kind: "income_change"; changePct: number; message: string }
  | { kind: "new_category"; category: string; message: string };
```

### New File: `src/lib/debrief/generate.ts`

Pure function (receives db, produces output — no HTTP calls except Anthropic).

```typescript
interface DebriefInput {
  weekStart: Date; // Monday 00:00 UTC
  weekEnd: Date; // Sunday 23:59 UTC
}

interface DebriefOutput {
  narrativeText: string;
  flags: DebriefFlag[];
}

async function generateDebrief(db: Db, input: DebriefInput): Promise<DebriefOutput>;
```

**Context built and passed to Claude:**

| Data                                                | Source                     | Purpose               |
| --------------------------------------------------- | -------------------------- | --------------------- |
| This week: income, expenses, net, by-category spend | `transaction` + `category` | Primary analysis      |
| Previous week: same shape                           | `transaction` + `category` | % deltas              |
| 3-month category averages                           | `transaction` + `category` | Baseline ("normal")   |
| Budget targets vs actuals                           | `budget_target`            | Budget overrun flags  |
| Recurring subscriptions due in next 7 days          | `recurring_subscription`   | `recurring_due` flags |
| User's base currency                                | `user.baseCurrency`        | Formatting            |

**Claude output format (structured JSON, not freeform):**

```json
{
  "narrative": "This week you spent €847, up 23% from last week...",
  "flags": [
    {
      "kind": "spending_spike",
      "category": "Food & Dining",
      "changePct": 40,
      "message": "40% more than last week"
    },
    {
      "kind": "budget_overrun",
      "category": "Entertainment",
      "message": "€45 over budget with 10 days remaining"
    }
  ]
}
```

Claude is instructed to return only valid JSON matching this schema. If the response is unparseable, `generateDebrief` throws — the cron route handles the error and returns 500 for retry.

### New File: `src/app/api/cron/weekly-debrief/route.ts`

```
POST /api/cron/weekly-debrief
Auth: Authorization: Bearer ${CRON_SECRET}  (same as existing cron routes)
```

**Logic:**

1. Validate `CRON_SECRET`
2. Compute `weekStart` = last Monday 00:00 UTC, `weekEnd` = last Sunday 23:59 UTC
3. Call `generateDebrief(db, { weekStart, weekEnd })`
4. Upsert into `weekly_debrief` on `(userId, weekStart)` — idempotent, safe to re-run
5. Return `{ ok: true, weekStart }`

**Error handling:**

- Anthropic failure → `generateDebrief` throws → route returns 500 → Vercel Cron retries
- No transactions for the week → Claude produces a "quiet week" narrative — not an error
- Re-run for same week → upsert overwrites with fresh result

### Drizzle Migration

New migration file adds `weekly_debrief` table with `UNIQUE (user_id, week_start)` constraint.

### Home Screen Change: `src/app/page.tsx`

Add to the `Promise.all` data fetch: latest `weekly_debrief` row for `PRIMARY_USER_ID`.

Render a new card between the "This month summary" and "Next actions" sections:

- If no debrief exists yet → card is omitted (no placeholder)
- If debrief exists → show `narrativeText` as prose + flag list as a compact row of badges

### Tests: `tests/unit/debrief-generate.test.ts`

- Valid Claude JSON response → parsed into `DebriefOutput` correctly
- Malformed Claude response → throws (not silently swallowed)
- Correct date range passed to DB queries (weekStart/weekEnd boundaries)
- Flags array is validated against known `kind` values; unknown kinds are dropped

---

## File Map

| File                                         | Action                             |
| -------------------------------------------- | ---------------------------------- |
| `src/lib/categorization/llm.ts`              | Create                             |
| `src/app/api/settings/import/route.ts`       | Modify — add LLM step              |
| `src/lib/db/schema.ts`                       | Modify — add `weeklyDebrief` table |
| `drizzle/migrations/XXXX_weekly_debrief.sql` | Create                             |
| `src/lib/debrief/generate.ts`                | Create                             |
| `src/app/api/cron/weekly-debrief/route.ts`   | Create                             |
| `src/app/page.tsx`                           | Modify — add debrief card          |
| `tests/unit/categorization-llm.test.ts`      | Create                             |
| `tests/unit/debrief-generate.test.ts`        | Create                             |

---

## Build Order

1. LLM categorization (no new DB tables, self-contained) → test → commit
2. `weekly_debrief` migration + schema → commit
3. `generateDebrief` function → test → commit
4. Cron route → commit
5. Home screen debrief card → commit

---

## Out of Scope

- Revolut Open Banking API connection
- Email / push notification delivery
- Confidence-gated review queue for LLM categorizations
- Vercel + Supabase deployment
- Per-user debrief scheduling preferences
