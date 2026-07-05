# Goals Design

## Goal

Give users a way to set financial goals (save, pay off debt, build a portfolio) and see live progress toward them — automatically derived from account balances already in the app. No manual progress entry.

---

## Scope

Four goal kinds: `cash_target`, `emergency_fund`, `debt_payoff`, `portfolio_target`. All are account-linked: progress is computed at page load by reading the latest `balance_snapshot` for each linked account. Optional target date triggers a "required monthly contribution" calculation.

**Out of scope:** Forecast (separate spec), push/email notifications, goal contributions history, advisor-goal integration, per-goal currency (all goals in `user.baseCurrency`).

---

## DB Schema: `goal` table

```typescript
export const goalKindEnum = pgEnum("goal_kind", [
  "cash_target",
  "emergency_fund",
  "debt_payoff",
  "portfolio_target",
]);

export const goal = pgTable("goal", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: goalKindEnum("kind").notNull(),
  targetAmount: integer("target_amount").notNull(), // cents in user's baseCurrency
  targetDate: date("target_date"), // nullable — optional deadline
  linkedAccountIds: uuid("linked_account_ids").array().notNull().default([]),
  initialBalance: integer("initial_balance"), // debt_payoff only: starting debt in cents (absolute value)
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```

`linkedAccountIds` is a plain `uuid[]` column. No join table — we don't need "which goals reference account X" queries. `initialBalance` is set once at creation for `debt_payoff` goals (current balance of linked liability accounts at that moment); never updated after creation.

**Drizzle migration:** new `goal_kind` pgEnum + `goal` table. No changes to existing tables.

---

## Progress Calculation

### New File: `src/lib/goals/progress.ts`

Pure function — no DB access, fully testable.

```typescript
export interface GoalProgress {
  currentAmount: number; // cents — how much has been saved/paid
  progressPct: number; // 0–100, capped at 100
  requiredMonthly: number | null; // null if no target date or already complete
}

export function calculateGoalProgress(
  goal: {
    kind: string;
    targetAmount: number;
    targetDate: string | null; // YYYY-MM-DD
    initialBalance: number | null;
  },
  linkedAccountBalances: number[], // balanceBaseCcy from latest snapshot, one per linked account
  today: string, // YYYY-MM-DD, injected for testability
): GoalProgress;
```

**Per-kind logic:**

| Kind               | `currentAmount`                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cash_target`      | `sum(linkedAccountBalances)`                                                                                                                                              |
| `emergency_fund`   | `sum(linkedAccountBalances)`                                                                                                                                              |
| `portfolio_target` | `sum(linkedAccountBalances)`                                                                                                                                              |
| `debt_payoff`      | `(initialBalance ?? 0) − sum(linkedAccountBalances)` clamped to ≥ 0. Note: liability account snapshots store balances as negative integers in this codebase; use `abs()`. |

`progressPct = Math.min(100, Math.round((currentAmount / targetAmount) * 100))`

**`requiredMonthly`:**

- Returns `null` if `targetDate` is null, `progressPct >= 100`, or `monthsLeft <= 0`
- `monthsLeft = max(1, fractionalMonthsBetween(today, targetDate))`
- `requiredMonthly = Math.ceil((targetAmount - currentAmount) / monthsLeft)`

### New File: `src/lib/goals/suggest.ts`

```typescript
// Returns suggested emergency fund targets based on last 90 days of expenses.
export async function suggestEmergencyFund(db: Db): Promise<{
  suggested3x: number; // cents
  suggested6x: number; // cents
}>;
```

Queries `transaction` joined to `category` where `category.kind = 'expense'` and `transaction.state = 'cleared'` for the past 90 days. Computes average monthly expense, returns `3x` and `6x` values. Returns `{ suggested3x: 0, suggested6x: 0 }` if no expense data.

---

## API Routes

All routes use the existing session auth pattern (session cookie validated against DB).

### `GET /api/goals`

Returns all non-archived goals for the session user, with live progress computed server-side.

Response shape:

```typescript
{
  goals: Array<{
    id: string;
    name: string;
    kind: GoalKind;
    targetAmount: number;
    targetDate: string | null;
    linkedAccountIds: string[];
    progress: GoalProgress;
    createdAt: string;
  }>;
}
```

Implementation: fetch all goals → fetch latest balance snapshot for each linked account (one `SELECT DISTINCT ON (account_id)` ordered by `as_of_date DESC`) → call `calculateGoalProgress` per goal.

### `POST /api/goals`

Creates a new goal.

Request body (Zod-validated):

```typescript
{
  name: z.string().min(1).max(100),
  kind: z.enum(["cash_target", "emergency_fund", "debt_payoff", "portfolio_target"]),
  targetAmount: z.number().int().positive(), // cents
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  linkedAccountIds: z.array(z.string().uuid()).min(1),
}
```

For `debt_payoff`: after insert, immediately query the latest `balanceBaseCcy` for each linked account, sum them, take `abs()`, and store as `initialBalance`. This is the only time `initialBalance` is written.

Returns `{ id: string }` on success.

### `PATCH /api/goals/[id]`

Updates `name`, `targetAmount`, `targetDate`, and/or `linkedAccountIds`. Sets `updatedAt = now()`. Returns updated goal row.

Body: same fields as POST, all optional. `kind` is not patchable (create a new goal instead).

For `debt_payoff` + `linkedAccountIds` change: re-query current balances and update `initialBalance`. This resets the progress baseline — acceptable UX for v1.

### `DELETE /api/goals/[id]`

Sets `isArchived = true`. Does not hard-delete. Returns `{ ok: true }`.

---

## Emergency Fund Suggestion Endpoint

### `GET /api/goals/emergency-suggestion`

No body. Returns `{ suggested3x: number; suggested6x: number }` by calling `suggestEmergencyFund(db)`. Used client-side to pre-fill the target amount field when kind = `emergency_fund`.

---

## UI

### `/goals` Page: `src/app/goals/page.tsx`

Server component. Fetches goals via direct DB queries (not via the API route — same pattern as other pages). Passes data to `GoalsView` client component.

### `src/app/goals/goals-view.tsx` (Client Component)

Renders list of `GoalCard` components + a "New goal" button that expands an inline `GoalForm`.

**`GoalCard`:**

- Name + kind badge (color-coded: green for savings kinds, red for debt, blue for portfolio)
- Progress bar (filled portion = `progressPct`)
- Amount text: "€3,240 of €10,000 saved" (or "paid" for `debt_payoff`)
- If `requiredMonthly` is set: chip "€180/mo needed"
- If `progressPct >= 100`: chip "Goal reached 🎯"
- Edit (pencil) and archive (×) icon buttons → inline form expansion (same UX pattern as recurring subscriptions)

**`GoalForm` (create and edit):**

1. Kind selector — 4 radio options with one-line descriptions
2. Name field
3. Target amount field (numeric, in base currency)
   - For `emergency_fund`: hint text "Suggested: €X (3×) – €Y (6×)" fetched from `/api/goals/emergency-suggestion` on kind selection
4. Target date field — date input, optional, with `(optional)` label
5. Account linker — `<select multiple>` showing all user accounts with their kind in parentheses. For `debt_payoff`, liability accounts are listed first.
6. Submit / Cancel buttons

Form validation: all required fields, `targetAmount > 0`, at least one account linked.

---

## File Map

| File                                              | Action                                                    |
| ------------------------------------------------- | --------------------------------------------------------- |
| `src/lib/db/schema.ts`                            | Modify — add `goalKindEnum`, `goal` table, inferred types |
| `src/lib/db/migrations/XXXX_goals.sql`            | Create — generated by `pnpm db:generate`                  |
| `src/lib/goals/progress.ts`                       | Create — `calculateGoalProgress` pure function            |
| `src/lib/goals/suggest.ts`                        | Create — `suggestEmergencyFund` DB helper                 |
| `src/app/api/goals/route.ts`                      | Create — GET + POST                                       |
| `src/app/api/goals/[id]/route.ts`                 | Create — PATCH + DELETE                                   |
| `src/app/api/goals/emergency-suggestion/route.ts` | Create — GET                                              |
| `src/app/goals/page.tsx`                          | Create — server component                                 |
| `src/app/goals/goals-view.tsx`                    | Create — client component                                 |
| `tests/unit/goal-progress.test.ts`                | Create — unit tests for `calculateGoalProgress`           |

---

## Tests: `tests/unit/goal-progress.test.ts`

- `cash_target`: sum of linked balances → correct `currentAmount` and `progressPct`
- `debt_payoff`: `initialBalance - abs(currentBalance)` → correct reduction
- `progressPct` capped at 100 when over target
- `requiredMonthly` correct when `targetDate` set and 6 months out
- `requiredMonthly` null when no `targetDate`
- `requiredMonthly` null when already at 100%

---

## Build Order

1. Schema + migration → commit
2. `calculateGoalProgress` pure function + unit tests → commit
3. `suggestEmergencyFund` helper → commit
4. API routes (GET, POST, PATCH, DELETE, emergency-suggestion) → commit
5. `/goals` page + `GoalsView` + `GoalCard` + `GoalForm` → commit
