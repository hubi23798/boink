# Budget Feature — Design Spec

**Date:** 2026-05-17
**Scope:** Phase 2, part 1 — monthly budget targets vs actuals. Forecast, rollover, and review wizard deferred.

---

## 1. Goal

Give the user a single place to set monthly spend targets per leaf category, see how they're tracking in real time, and navigate past months. Legible to all levels of financial literacy — plain English labels, no jargon.

---

## 2. Data Model

### New table: `budget_target`

```
id            uuid         PK, defaultRandom()
user_id       uuid         FK → user(id) ON DELETE CASCADE, NOT NULL
category_id   uuid         FK → category(id) ON DELETE CASCADE, NOT NULL
amount_monthly bigint      NOT NULL  (minor units, user's base currency)
created_at    timestamptz  NOT NULL, defaultNow()
updated_at    timestamptz  NOT NULL, defaultNow()

UNIQUE (user_id, category_id)
```

- One row per (user, category). Updating overwrites the previous value — no history for now.
- Amounts in minor units matching the user's `base_currency` (same convention as `transaction.amountNative`).
- Deleting a row means "no target set" for that category.

### Schema additions in `src/lib/db/schema.ts`

Add `budgetTarget` table export and inferred types `BudgetTarget` / `NewBudgetTarget`.

### Migration

`pnpm db:generate` → `pnpm db:migrate`. One new table, no changes to existing tables.

---

## 3. API Routes

### `PUT /api/budget-targets/[categoryId]`

Set (create or update) a monthly target for a leaf category.

**Request body:** `{ amountMonthly: number }` (positive integer, minor units)

**Validation:**

- `categoryId` must belong to the authenticated user
- Category must be a leaf (has a `parentId`) and kind must be `expense` or `investment_flow`
- `amountMonthly` must be a positive integer

**Response:** `200 { id, categoryId, amountMonthly }`

**Side effect:** upsert via Drizzle `onConflictDoUpdate`.

### `DELETE /api/budget-targets/[categoryId]`

Remove target for a category. Idempotent — 200 even if no row existed.

---

## 4. `/budget` Page

### URL & navigation

- Default: `/budget` → current calendar month
- Month param: `/budget?month=2026-04` (YYYY-MM). Past months: unrestricted. Future: Next button is disabled when already on the current month.
- Prev / Next month buttons in the header. "This month" link resets to current.

### Data loaded (server component)

1. All leaf categories where `kind IN ('expense', 'investment_flow')` and `isArchived = false`, with their parent name.
2. All `budget_target` rows for the user.
3. Monthly actuals: `SUM(amountNative)` per `categoryId` for transactions where:
   - `startedAt` falls within the selected calendar month (first to last day, inclusive)
   - `state = 'completed'`
   - `categoryId` is one of the leaf categories in scope
   - Amount is negative (expenses) — stored as negative in the ledger

   Actuals are expressed as a positive number for display (abs value of the sum).

### Layout

```
Budget                          [← Apr]  May 2026  [Jun →]

FOOD & DRINK                      €580 spent  /  €800 target
  Groceries         ████████░░  €320 / €400   On track
  Restaurants       ████░░░░░░  €140 / €200   On track
  Takeaway          ██████████  €120 / €100   Over budget
  Coffee            —           €18           No target

TRANSPORT                         €90 spent  /  €150 target
  ...

SUBSCRIPTIONS                     €45 spent  /  no target
  Netflix           —           €18           No target
  Spotify           —           €10           No target
  ...
```

**Parent group row:** name, total spent across ALL leaves in the group (whether targeted or not), total target (sum of set targets only). No status pill — just the numbers.

**Leaf row:**

- Category name
- Progress bar (only rendered if target set; hidden for no-target rows)
- `€spent / €target` or just `€spent` if no target
- Status pill (see §5)
- Clicking the target amount (or "Set target" text) activates inline editing

**Categories with no target:** shown, subdued (muted text, no progress bar). Serve as a reminder to set a target if desired.

**Empty state:** if no leaf categories exist, show "Add categories in Settings → Categories first."

### Inline target editing (client component)

- Clicking the target amount or "Set target" placeholder renders a small `<input type="number">` in place.
- Submit on Enter or blur → `PUT /api/budget-targets/[categoryId]`
- Cancel on Escape → revert to display mode
- Optimistic update: update local state immediately; revert on error with a toast.
- After save, the row re-renders with the new target and updated status.
- Clicking the existing target while in another row's edit mode commits the previous edit first.
- "Remove target" affordance: small ✕ button next to the input, calls `DELETE /api/budget-targets/[categoryId]`.

The inline edit component is isolated: `BudgetRow` client component receives `{ category, target, actual }` props and manages its own edit state.

---

## 5. Status Logic

Computed from `(actual / target)` ratio. Income and transfer categories are excluded entirely — they don't appear on the budget page.

| Condition           | Label         | Colour token    |
| ------------------- | ------------- | --------------- |
| No target set       | No target     | `text-fg-muted` |
| ratio < 0.80        | On track      | green           |
| 0.80 ≤ ratio < 1.00 | Getting close | amber / warning |
| ratio ≥ 1.00        | Over budget   | red             |

The 80% threshold is a constant `BUDGET_WARN_THRESHOLD = 0.8` in the budget utility module.

---

## 6. Nav & Entry Point

Add `/budget` between `Recurring` and `Categories` in `src/components/nav.tsx`.

---

## 7. Files Touched / Created

**New:**

- `src/lib/db/migrations/XXXX_budget_target.sql` (generated)
- `src/app/budget/page.tsx` — server component (data loading + layout)
- `src/app/budget/budget-row.tsx` — client component (inline editing)
- `src/app/api/budget-targets/[categoryId]/route.ts` — PUT + DELETE handlers
- `src/lib/budget/compute.ts` — `computeBudgetStatus(actual, target)` pure function
- `tests/unit/budget.test.ts` — unit tests for compute.ts

**Modified:**

- `src/lib/db/schema.ts` — add `budgetTarget` table + types
- `src/components/nav.tsx` — add `/budget` link

---

## 8. Tests

Unit tests in `tests/unit/budget.test.ts` covering `computeBudgetStatus`:

- No target → `{ status: 'no_target' }`
- 0% spent → `{ status: 'on_track', ratio: 0 }`
- 79% spent → `{ status: 'on_track', ratio: 0.79 }`
- 80% spent → `{ status: 'getting_close', ratio: 0.80 }`
- 99% spent → `{ status: 'getting_close', ratio: 0.99 }`
- 100% spent → `{ status: 'over_budget', ratio: 1.0 }`
- 120% spent → `{ status: 'over_budget', ratio: 1.2 }`
- Zero target (guard) → `{ status: 'no_target' }` (avoid divide-by-zero)

No integration tests needed for the budget page — the compute logic is pure and fully covered by unit tests.

---

## 9. Out of Scope

- Rollover of unused budget across months
- Per-month target history (targets are "current" only)
- Budget review wizard / monthly ritual
- Forecast / goal projections
- Income or transfer category budgets
- Notifications or alerts when approaching limit
- Budget vs forecast comparison view

---

## 10. Open Questions (resolved)

- **Target granularity:** leaf categories only ✓
- **80% threshold:** confirmed ✓
- **Show no-target categories:** yes, subdued ✓
- **Exclude income/transfer from view:** yes ✓
- **Future month navigation:** disabled (clamp to current month max) ✓
