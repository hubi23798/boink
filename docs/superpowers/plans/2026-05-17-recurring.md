# Recurring Subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add confirmed subscriptions, dismissals, and budget integration on top of the existing recurring transaction detector.

**Architecture:** Two new DB tables (`recurring_subscription`, `recurring_dismissal`) persist user decisions. The server-rendered page fetches both tables plus runs `detectRecurring()` on the fly, filters out confirmed/dismissed keys, and passes the result to a `RecurringView` client component that handles all inline forms and optimistic updates. Budget proposals are computed by a pure function and returned from the API — no extra DB table needed.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, PostgreSQL (Docker), Zod, Vitest, Tailwind CSS.

---

## File Map

| File                                                | Action | Responsibility                                                                   |
| --------------------------------------------------- | ------ | -------------------------------------------------------------------------------- |
| `src/lib/db/schema.ts`                              | Modify | Add `frequencyEnum`, `recurringSubscription`, `recurringDismissal`, type exports |
| `src/lib/recurring/budget-proposal.ts`              | Create | Pure `computeBudgetProposal` function                                            |
| `tests/unit/recurring-budget.test.ts`               | Create | Unit tests for `computeBudgetProposal`                                           |
| `src/app/api/recurring/subscriptions/route.ts`      | Create | POST — create subscription + budget check                                        |
| `src/app/api/recurring/subscriptions/[id]/route.ts` | Create | PATCH + DELETE                                                                   |
| `src/app/api/recurring/dismissals/route.ts`         | Create | POST — dismiss detection key                                                     |
| `src/app/recurring/page.tsx`                        | Modify | Thin server wrapper — fetch data, render `<RecurringView>`                       |
| `src/app/recurring/recurring-view.tsx`              | Create | `"use client"` — full interactive UI                                             |

---

## Task 1: Schema additions + migration

**Files:**

- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Add `frequencyEnum`, `recurringSubscription`, and `recurringDismissal` to schema**

Open `src/lib/db/schema.ts`. After the `pendingProposalStatusEnum` block (around line 105) add the new enum. After the `pendingProposal` table (end of tables section, around line 415) add the two new tables. At the end of the type exports block add four new types.

Add the enum after the existing advisor enums:

```typescript
export const frequencyEnum = pgEnum("frequency", ["weekly", "fortnightly", "monthly"]);
```

Add the two tables after the `pendingProposal` table definition:

```typescript
export const recurringSubscription = pgTable(
  "recurring_subscription",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    detectionKey: text("detection_key"),
    name: text("name").notNull(),
    frequency: frequencyEnum("frequency").notNull(),
    amountNative: bigint("amount_native", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    categoryId: uuid("category_id").references(() => category.id, { onDelete: "set null" }),
    nextDue: date("next_due"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("recurring_subscription_user_id_idx").on(t.userId)],
);

export const recurringDismissal = pgTable(
  "recurring_dismissal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("recurring_dismissal_user_id_key_idx").on(t.userId, t.key)],
);
```

Add four type exports at the end of the `// -- Inferred types ---` block:

```typescript
export type RecurringSubscription = typeof recurringSubscription.$inferSelect;
export type NewRecurringSubscription = typeof recurringSubscription.$inferInsert;
export type RecurringDismissal = typeof recurringDismissal.$inferSelect;
export type NewRecurringDismissal = typeof recurringDismissal.$inferInsert;
```

- [ ] **Step 2: Generate and apply migration**

```bash
pnpm db:generate
```

Expected: a new file like `src/lib/db/migrations/0005_*.sql` is created.

```bash
pnpm db:migrate
```

Expected: `No migrations to run` or `Applied 1 migration` — no errors.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/
git commit -m "feat(recurring): add recurring_subscription and recurring_dismissal tables"
```

---

## Task 2: Budget proposal logic + tests

**Files:**

- Create: `src/lib/recurring/budget-proposal.ts`
- Create: `tests/unit/recurring-budget.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/recurring-budget.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { computeBudgetProposal } from "@/lib/recurring/budget-proposal";

describe("computeBudgetProposal", () => {
  it("returns none when categoryId is null", () => {
    expect(computeBudgetProposal(null, -8999, null)).toEqual({ action: "none" });
  });

  it("returns none when categoryId is null even with existing target", () => {
    expect(computeBudgetProposal(null, -8999, 8000)).toEqual({ action: "none" });
  });

  it("returns create when category set and no existing target", () => {
    expect(computeBudgetProposal("cat-1", -8999, null)).toEqual({
      action: "create",
      amount: 8999,
    });
  });

  it("returns create for income (positive amount) with no existing target", () => {
    expect(computeBudgetProposal("cat-1", 175000, null)).toEqual({
      action: "create",
      amount: 175000,
    });
  });

  it("returns none when category set and amounts match", () => {
    expect(computeBudgetProposal("cat-1", -8999, 8999)).toEqual({ action: "none" });
  });

  it("returns conflict when category set and amounts differ", () => {
    expect(computeBudgetProposal("cat-1", -8999, 8000)).toEqual({
      action: "conflict",
      existingAmount: 8000,
      proposedAmount: 8999,
    });
  });

  it("returns conflict when existing target is higher than subscription", () => {
    expect(computeBudgetProposal("cat-1", -6000, 9000)).toEqual({
      action: "conflict",
      existingAmount: 9000,
      proposedAmount: 6000,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test:unit --reporter=verbose tests/unit/recurring-budget.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/recurring/budget-proposal'`

- [ ] **Step 3: Implement `computeBudgetProposal`**

Create `src/lib/recurring/budget-proposal.ts`:

```typescript
export type BudgetProposalAction =
  | { action: "none" }
  | { action: "create"; amount: number }
  | { action: "conflict"; existingAmount: number; proposedAmount: number };

export function computeBudgetProposal(
  categoryId: string | null,
  subscriptionAmount: number,
  existingTarget: number | null,
): BudgetProposalAction {
  if (!categoryId) return { action: "none" };
  const proposed = Math.abs(subscriptionAmount);
  if (existingTarget === null) return { action: "create", amount: proposed };
  if (existingTarget === proposed) return { action: "none" };
  return { action: "conflict", existingAmount: existingTarget, proposedAmount: proposed };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test:unit --reporter=verbose tests/unit/recurring-budget.test.ts
```

Expected: 7/7 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recurring/budget-proposal.ts tests/unit/recurring-budget.test.ts
git commit -m "feat(recurring): add computeBudgetProposal pure function + tests"
```

---

## Task 3: API routes

**Files:**

- Create: `src/app/api/recurring/subscriptions/route.ts`
- Create: `src/app/api/recurring/subscriptions/[id]/route.ts`
- Create: `src/app/api/recurring/dismissals/route.ts`

- [ ] **Step 1: Create POST subscriptions route**

Create `src/app/api/recurring/subscriptions/route.ts`:

```typescript
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { readSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { PRIMARY_USER_ID, budgetTarget, category, recurringSubscription } from "@/lib/db/schema";
import { env } from "@/env";
import { computeBudgetProposal } from "@/lib/recurring/budget-proposal";

const bodySchema = z.object({
  detectionKey: z.string().optional(),
  name: z.string().min(1).max(200),
  frequency: z.enum(["weekly", "fortnightly", "monthly"]),
  amountNative: z.number().int(),
  currency: z.string().length(3),
  categoryId: z.string().uuid().optional(),
  nextDue: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const sid = cookieStore.get(env().SESSION_COOKIE_NAME)?.value;
  if (!sid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const sess = await readSession(db, sid);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { detectionKey, name, frequency, amountNative, currency, categoryId, nextDue } =
    parsed.data;

  const now = new Date();
  const [sub] = await db
    .insert(recurringSubscription)
    .values({
      userId: PRIMARY_USER_ID,
      detectionKey: detectionKey ?? null,
      name,
      frequency,
      amountNative,
      currency,
      categoryId: categoryId ?? null,
      nextDue: nextDue ?? null,
      updatedAt: now,
    })
    .returning();

  if (!categoryId) {
    return NextResponse.json({ subscription: sub }, { status: 201 });
  }

  const [existingRow] = await db
    .select({ amountMonthly: budgetTarget.amountMonthly })
    .from(budgetTarget)
    .where(and(eq(budgetTarget.userId, PRIMARY_USER_ID), eq(budgetTarget.categoryId, categoryId)));

  const proposal = computeBudgetProposal(
    categoryId,
    amountNative,
    existingRow?.amountMonthly ?? null,
  );

  if (proposal.action === "create") {
    await db
      .insert(budgetTarget)
      .values({
        userId: PRIMARY_USER_ID,
        categoryId,
        amountMonthly: proposal.amount,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [budgetTarget.userId, budgetTarget.categoryId],
        set: { amountMonthly: proposal.amount, updatedAt: now },
      });
    return NextResponse.json({ subscription: sub, budgetCreated: true }, { status: 201 });
  }

  if (proposal.action === "conflict") {
    const [cat] = await db
      .select({ name: category.name })
      .from(category)
      .where(eq(category.id, categoryId));
    return NextResponse.json(
      {
        subscription: sub,
        budgetConflict: {
          existingAmount: proposal.existingAmount,
          proposedAmount: proposal.proposedAmount,
          categoryName: cat?.name ?? categoryId,
        },
      },
      { status: 201 },
    );
  }

  return NextResponse.json({ subscription: sub }, { status: 201 });
}
```

- [ ] **Step 2: Create PATCH + DELETE subscriptions/[id] route**

Create `src/app/api/recurring/subscriptions/[id]/route.ts`:

```typescript
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { readSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { PRIMARY_USER_ID, budgetTarget, category, recurringSubscription } from "@/lib/db/schema";
import { env } from "@/env";
import { computeBudgetProposal } from "@/lib/recurring/budget-proposal";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  frequency: z.enum(["weekly", "fortnightly", "monthly"]).optional(),
  amountNative: z.number().int().optional(),
  currency: z.string().length(3).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  nextDue: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const sid = cookieStore.get(env().SESSION_COOKIE_NAME)?.value;
  if (!sid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const sess = await readSession(db, sid);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const existing = await db.query.recurringSubscription.findFirst({
    where: and(eq(recurringSubscription.id, id), eq(recurringSubscription.userId, PRIMARY_USER_ID)),
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();
  const [sub] = await db
    .update(recurringSubscription)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.frequency !== undefined ? { frequency: parsed.data.frequency } : {}),
      ...(parsed.data.amountNative !== undefined ? { amountNative: parsed.data.amountNative } : {}),
      ...(parsed.data.currency !== undefined ? { currency: parsed.data.currency } : {}),
      ...("categoryId" in parsed.data ? { categoryId: parsed.data.categoryId ?? null } : {}),
      ...("nextDue" in parsed.data ? { nextDue: parsed.data.nextDue ?? null } : {}),
      updatedAt: now,
    })
    .where(and(eq(recurringSubscription.id, id), eq(recurringSubscription.userId, PRIMARY_USER_ID)))
    .returning();

  const newCategoryId = sub!.categoryId;
  const categoryOrAmountChanged =
    "categoryId" in parsed.data || parsed.data.amountNative !== undefined;

  if (!newCategoryId || !categoryOrAmountChanged) {
    return NextResponse.json({ subscription: sub });
  }

  const [existingRow] = await db
    .select({ amountMonthly: budgetTarget.amountMonthly })
    .from(budgetTarget)
    .where(
      and(eq(budgetTarget.userId, PRIMARY_USER_ID), eq(budgetTarget.categoryId, newCategoryId)),
    );

  const proposal = computeBudgetProposal(
    newCategoryId,
    sub!.amountNative,
    existingRow?.amountMonthly ?? null,
  );

  if (proposal.action === "create") {
    await db
      .insert(budgetTarget)
      .values({
        userId: PRIMARY_USER_ID,
        categoryId: newCategoryId,
        amountMonthly: proposal.amount,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [budgetTarget.userId, budgetTarget.categoryId],
        set: { amountMonthly: proposal.amount, updatedAt: now },
      });
    return NextResponse.json({ subscription: sub, budgetCreated: true });
  }

  if (proposal.action === "conflict") {
    const [cat] = await db
      .select({ name: category.name })
      .from(category)
      .where(eq(category.id, newCategoryId));
    return NextResponse.json({
      subscription: sub,
      budgetConflict: {
        existingAmount: proposal.existingAmount,
        proposedAmount: proposal.proposedAmount,
        categoryName: cat?.name ?? newCategoryId,
      },
    });
  }

  return NextResponse.json({ subscription: sub });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const sid = cookieStore.get(env().SESSION_COOKIE_NAME)?.value;
  if (!sid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const sess = await readSession(db, sid);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  await db
    .delete(recurringSubscription)
    .where(
      and(eq(recurringSubscription.id, id), eq(recurringSubscription.userId, PRIMARY_USER_ID)),
    );

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Create POST dismissals route**

Create `src/app/api/recurring/dismissals/route.ts`:

```typescript
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { PRIMARY_USER_ID, recurringDismissal } from "@/lib/db/schema";
import { env } from "@/env";

const bodySchema = z.object({ key: z.string().min(1) });

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const sid = cookieStore.get(env().SESSION_COOKIE_NAME)?.value;
  if (!sid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const sess = await readSession(db, sid);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  await db
    .insert(recurringDismissal)
    .values({ userId: PRIMARY_USER_ID, key: parsed.data.key })
    .onConflictDoNothing();

  return NextResponse.json({ ok: true }, { status: 201 });
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/recurring/
git commit -m "feat(recurring): API routes — subscriptions CRUD + dismissals"
```

---

## Task 4: Page refactor + RecurringView client component

**Files:**

- Modify: `src/app/recurring/page.tsx`
- Create: `src/app/recurring/recurring-view.tsx`

- [ ] **Step 1: Replace page.tsx with thin server wrapper**

Overwrite `src/app/recurring/page.tsx` with:

```typescript
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gte } from "drizzle-orm";
import { readSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import {
  PRIMARY_USER_ID,
  account,
  category,
  recurringDismissal,
  recurringSubscription,
  transaction,
  user,
} from "@/lib/db/schema";
import { env } from "@/env";
import { detectRecurring } from "@/lib/recurring/detect";
import { RecurringView } from "./recurring-view";

export default async function RecurringPage() {
  const cookieStore = await cookies();
  const sid = cookieStore.get(env().SESSION_COOKIE_NAME)?.value;
  if (!sid) redirect("/login");

  const db = getDb();
  const sess = await readSession(db, sid);
  if (!sess) redirect("/login");

  const asOf = new Date();
  const lookback = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 3, asOf.getUTCDate()),
  );

  const [subs, dismissals, txns, accounts, allCats, userRows] = await Promise.all([
    db.query.recurringSubscription.findMany({
      where: eq(recurringSubscription.userId, PRIMARY_USER_ID),
    }),
    db.query.recurringDismissal.findMany({
      where: eq(recurringDismissal.userId, PRIMARY_USER_ID),
      columns: { key: true },
    }),
    db.query.transaction.findMany({
      where: gte(transaction.startedAt, lookback),
      columns: {
        accountId: true,
        descriptionRaw: true,
        amountNative: true,
        currency: true,
        startedAt: true,
      },
    }),
    db.query.account.findMany({
      where: eq(account.userId, PRIMARY_USER_ID),
      columns: { id: true, name: true },
    }),
    db.query.category.findMany({
      where: and(eq(category.userId, PRIMARY_USER_ID), eq(category.isArchived, false)),
      columns: { id: true, name: true, parentId: true, kind: true },
      orderBy: (c, { asc }) => [asc(c.name)],
    }),
    db
      .select({ baseCurrency: user.baseCurrency })
      .from(user)
      .where(eq(user.id, PRIMARY_USER_ID))
      .limit(1),
  ]);

  const confirmedKeys = new Set(
    subs.map((s) => s.detectionKey).filter((k): k is string => k !== null),
  );
  const dismissedKeys = new Set(dismissals.map((d) => d.key));

  const allDetected = detectRecurring(txns, asOf);
  const candidates = allDetected.filter(
    (r) => !confirmedKeys.has(r.key) && !dismissedKeys.has(r.key),
  );

  const parentMap = new Map(
    allCats.filter((c) => !c.parentId).map((c) => [c.id, c.name]),
  );
  const categories = allCats
    .filter((c) => c.parentId && (c.kind === "expense" || c.kind === "investment_flow"))
    .map((c) => ({
      id: c.id,
      name: c.name,
      parentName: parentMap.get(c.parentId!) ?? "Other",
    }));

  const accountNames = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const currency = userRows[0]?.baseCurrency ?? "EUR";

  return (
    <RecurringView
      subscriptions={subs}
      candidates={candidates}
      categories={categories}
      accountNames={accountNames}
      currency={currency}
    />
  );
}
```

- [ ] **Step 2: Create RecurringView client component**

Create `src/app/recurring/recurring-view.tsx`:

```typescript
"use client";

import { useState } from "react";
import type { RecurringSubscription } from "@/lib/db/schema";
import type { RecurringItem, Frequency } from "@/lib/recurring/detect";

interface CategoryOption {
  id: string;
  name: string;
  parentName: string;
}

interface BudgetConflict {
  subscriptionId: string;
  categoryId: string;
  existingAmount: number;
  proposedAmount: number;
  categoryName: string;
}

interface FormState {
  name: string;
  amount: string;
  frequency: Frequency;
  categoryId: string;
  nextDue: string;
}

interface RecurringViewProps {
  subscriptions: RecurringSubscription[];
  candidates: RecurringItem[];
  categories: CategoryOption[];
  accountNames: Record<string, string>;
  currency: string;
}

function fmt(minorAbs: number, currency: string) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(minorAbs / 100);
}

function freqLabel(f: Frequency) {
  return { weekly: "Weekly", fortnightly: "Fortnightly", monthly: "Monthly" }[f];
}

function toMonthly(absAmount: number, freq: Frequency): number {
  if (freq === "weekly") return (absAmount * 52) / 12;
  if (freq === "fortnightly") return (absAmount * 26) / 12;
  return absAmount;
}

function nextDueLabel(nextDue: string | null): string {
  if (!nextDue) return "";
  const diff = Math.round((new Date(nextDue).getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "due today";
  return `due in ${diff}d`;
}

function nextExpectedLabel(nextExpected: Date): string {
  const diff = Math.round((nextExpected.getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "due today";
  return `due in ${diff}d`;
}

function defaultFormFromCandidate(item: RecurringItem): FormState {
  return {
    name: item.description,
    amount: String(Math.abs(item.amountNative) / 100),
    frequency: item.frequency,
    categoryId: "",
    nextDue: item.nextExpected.toISOString().slice(0, 10),
  };
}

function defaultFormFromSub(sub: RecurringSubscription): FormState {
  return {
    name: sub.name,
    amount: String(Math.abs(sub.amountNative) / 100),
    frequency: sub.frequency,
    categoryId: sub.categoryId ?? "",
    nextDue: sub.nextDue ?? "",
  };
}

const FREQ_ORDER: Record<Frequency, number> = { monthly: 0, fortnightly: 1, weekly: 2 };

export function RecurringView({
  subscriptions: initialSubs,
  candidates: initialCandidates,
  categories,
  accountNames,
  currency,
}: RecurringViewProps) {
  const [subs, setSubs] = useState<RecurringSubscription[]>(initialSubs);
  const [candidates, setCandidates] = useState<RecurringItem[]>(initialCandidates);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    name: "",
    amount: "",
    frequency: "monthly",
    categoryId: "",
    nextDue: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [budgetConflicts, setBudgetConflicts] = useState<BudgetConflict[]>([]);

  const confirmedMonthly = subs
    .filter((s) => s.currency === currency)
    .reduce((sum, s) => sum + toMonthly(Math.abs(s.amountNative), s.frequency), 0);
  const detectedMonthly = candidates
    .filter((c) => c.currency === currency)
    .reduce((sum, c) => sum + toMonthly(Math.abs(c.amountNative), c.frequency), 0);

  function openForm(key: string, prefill: FormState) {
    setExpandedKey(key);
    setForm(prefill);
    setFormError(null);
  }

  function closeForm() {
    setExpandedKey(null);
    setFormError(null);
  }

  async function handleDismiss(key: string) {
    setCandidates((prev) => prev.filter((c) => c.key !== key));
    await fetch("/api/recurring/dismissals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
  }

  async function handleDelete(id: string) {
    setSubs((prev) => prev.filter((s) => s.id !== id));
    setBudgetConflicts((prev) => prev.filter((c) => c.subscriptionId !== id));
    await fetch(`/api/recurring/subscriptions/${id}`, { method: "DELETE" });
  }

  async function handleSave(opts:
    | { mode: "confirm"; detectionKey: string; candidateCurrency: string; amountSign: -1 | 1 }
    | { mode: "edit"; id: string; subCurrency: string; amountSign: -1 | 1 }
    | { mode: "new" }
  ) {
    setSaving(true);
    setFormError(null);

    const amountMajor = parseFloat(form.amount);
    if (isNaN(amountMajor) || amountMajor <= 0) {
      setFormError("Amount must be a positive number");
      setSaving(false);
      return;
    }

    const amountSign = opts.mode === "new" ? -1 : opts.amountSign;
    const amountNative = amountSign * Math.round(amountMajor * 100);
    const subCurrency =
      opts.mode === "confirm"
        ? opts.candidateCurrency
        : opts.mode === "edit"
          ? opts.subCurrency
          : currency;

    const body: Record<string, unknown> = {
      name: form.name.trim(),
      frequency: form.frequency,
      amountNative,
      currency: subCurrency,
      ...(form.categoryId ? { categoryId: form.categoryId } : {}),
      ...(form.nextDue ? { nextDue: form.nextDue } : {}),
    };
    if (opts.mode === "confirm") body.detectionKey = opts.detectionKey;

    const url =
      opts.mode === "edit"
        ? `/api/recurring/subscriptions/${opts.id}`
        : "/api/recurring/subscriptions";
    const method = opts.mode === "edit" ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setFormError("Failed to save");
        return;
      }

      const data = (await res.json()) as {
        subscription: RecurringSubscription;
        budgetCreated?: boolean;
        budgetConflict?: { existingAmount: number; proposedAmount: number; categoryName: string };
      };

      if (opts.mode === "confirm") {
        setCandidates((prev) => prev.filter((c) => c.key !== opts.detectionKey));
        setSubs((prev) =>
          [...prev, data.subscription].sort(
            (a, b) =>
              FREQ_ORDER[a.frequency] - FREQ_ORDER[b.frequency] ||
              Math.abs(b.amountNative) - Math.abs(a.amountNative),
          ),
        );
      } else if (opts.mode === "edit") {
        setSubs((prev) => prev.map((s) => (s.id === opts.id ? data.subscription : s)));
      } else {
        setSubs((prev) =>
          [...prev, data.subscription].sort(
            (a, b) =>
              FREQ_ORDER[a.frequency] - FREQ_ORDER[b.frequency] ||
              Math.abs(b.amountNative) - Math.abs(a.amountNative),
          ),
        );
      }

      if (data.budgetConflict && form.categoryId) {
        setBudgetConflicts((prev) => [
          ...prev.filter((c) => c.subscriptionId !== data.subscription.id),
          {
            subscriptionId: data.subscription.id,
            categoryId: form.categoryId,
            ...data.budgetConflict!,
          },
        ]);
      }

      closeForm();
    } catch {
      setFormError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleBudgetUpdate(conflict: BudgetConflict) {
    try {
      const res = await fetch(`/api/budget-targets/${conflict.categoryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountMonthly: conflict.proposedAmount }),
      });
      if (res.ok) {
        setBudgetConflicts((prev) =>
          prev.filter((c) => c.subscriptionId !== conflict.subscriptionId),
        );
      }
    } catch {
      // no-op — user can retry by dismissing and re-confirming
    }
  }

  function dismissConflict(subscriptionId: string) {
    setBudgetConflicts((prev) => prev.filter((c) => c.subscriptionId !== subscriptionId));
  }

  const sortedSubs = [...subs].sort(
    (a, b) =>
      FREQ_ORDER[a.frequency] - FREQ_ORDER[b.frequency] ||
      Math.abs(b.amountNative) - Math.abs(a.amountNative),
  );
  const groupedSubs: Record<Frequency, RecurringSubscription[]> = {
    monthly: sortedSubs.filter((s) => s.frequency === "monthly"),
    fortnightly: sortedSubs.filter((s) => s.frequency === "fortnightly"),
    weekly: sortedSubs.filter((s) => s.frequency === "weekly"),
  };

  function InlineForm({ onSave }: { onSave: () => void }) {
    return (
      <div className="border-border-subtle space-y-3 border-t px-4 py-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className="text-fg-muted mb-1 block text-xs">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="border-border-subtle bg-surface w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-fg-muted"
            />
          </div>
          <div>
            <label className="text-fg-muted mb-1 block text-xs">Amount</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="border-border-subtle bg-surface w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-fg-muted"
            />
          </div>
          <div>
            <label className="text-fg-muted mb-1 block text-xs">Frequency</label>
            <select
              value={form.frequency}
              onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as Frequency }))}
              className="border-border-subtle bg-surface w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-fg-muted"
            >
              <option value="monthly">Monthly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          <div>
            <label className="text-fg-muted mb-1 block text-xs">Category (optional)</label>
            <select
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              className="border-border-subtle bg-surface w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-fg-muted"
            >
              <option value="">— none —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parentName} › {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-fg-muted mb-1 block text-xs">Next due (optional)</label>
            <input
              type="date"
              value={form.nextDue}
              onChange={(e) => setForm((f) => ({ ...f, nextDue: e.target.value }))}
              className="border-border-subtle bg-surface w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-fg-muted"
            />
          </div>
        </div>
        {formError && <p className="text-xs text-red-500">{formError}</p>}
        <div className="flex gap-2">
          <button
            onClick={onSave}
            disabled={saving}
            className="bg-fg-default text-surface rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={closeForm} className="text-fg-muted hover:text-fg-default text-sm">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Recurring</h1>
          <p className="text-fg-muted mt-1 text-sm tabular-nums">
            {fmt(confirmedMonthly, currency)}/mo confirmed
            {detectedMonthly > 0 && (
              <> · {fmt(detectedMonthly, currency)}/mo detected</>
            )}
          </p>
        </div>
        <button
          onClick={() => openForm("new", { name: "", amount: "", frequency: "monthly", categoryId: "", nextDue: "" })}
          className="border-border-subtle text-fg-muted hover:text-fg-default rounded border px-3 py-1.5 text-sm"
        >
          + Add subscription
        </button>
      </div>

      {/* New subscription inline form */}
      {expandedKey === "new" && (
        <div className="border-border-subtle overflow-hidden rounded-xl border">
          <InlineForm onSave={() => void handleSave({ mode: "new" })} />
        </div>
      )}

      {/* Confirmed subscriptions */}
      {(["monthly", "fortnightly", "weekly"] as Frequency[]).map((freq) => {
        const items = groupedSubs[freq];
        if (items.length === 0) return null;
        return (
          <section key={freq} className="space-y-0">
            <div className="border-border-subtle border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide">
              {freqLabel(freq)}
            </div>
            <div className="border-border-subtle divide-border-subtle divide-y overflow-hidden rounded-b-xl border border-t-0">
              {items.map((sub) => {
                const conflict = budgetConflicts.find((c) => c.subscriptionId === sub.id);
                const isEditing = expandedKey === sub.id;
                const dueSoon = sub.nextDue !== null && sub.nextDue < new Date().toISOString().slice(0, 10);
                return (
                  <div key={sub.id}>
                    <div className="flex items-center justify-between px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{sub.name}</p>
                        {sub.nextDue && (
                          <p className={`text-xs tabular-nums ${dueSoon ? "text-red-600 dark:text-red-400" : "text-fg-muted"}`}>
                            {nextDueLabel(sub.nextDue)}
                          </p>
                        )}
                      </div>
                      <div className="ml-4 flex shrink-0 items-center gap-3">
                        <span className="tabular-nums font-medium">
                          {sub.amountNative < 0 ? "−" : "+"}
                          {fmt(Math.abs(sub.amountNative), sub.currency)}
                        </span>
                        <button
                          onClick={() =>
                            isEditing
                              ? closeForm()
                              : openForm(sub.id, defaultFormFromSub(sub))
                          }
                          className="text-fg-muted hover:text-fg-default text-xs"
                          title="Edit"
                        >
                          ✏
                        </button>
                        <button
                          onClick={() => void handleDelete(sub.id)}
                          className="text-fg-muted hover:text-red-500 text-xs"
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    {isEditing && (
                      <InlineForm
                        onSave={() =>
                          void handleSave({
                            mode: "edit",
                            id: sub.id,
                            subCurrency: sub.currency,
                            amountSign: sub.amountNative < 0 ? -1 : 1,
                          })
                        }
                      />
                    )}
                    {conflict && (
                      <div className="border-border-subtle border-t px-4 py-3 text-sm">
                        <p>
                          Budget target for <strong>{conflict.categoryName}</strong> is{" "}
                          {fmt(conflict.existingAmount, currency)}/mo — this subscription costs{" "}
                          {fmt(conflict.proposedAmount, currency)}/mo. Update?
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => void handleBudgetUpdate(conflict)}
                            className="bg-fg-default text-surface rounded px-3 py-1 text-xs font-medium"
                          >
                            Update
                          </button>
                          <button
                            onClick={() => dismissConflict(sub.id)}
                            className="text-fg-muted hover:text-fg-default text-xs"
                          >
                            Keep existing
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Suggested candidates */}
      {candidates.length > 0 && (
        <section className="space-y-0">
          <div className="border-border-subtle text-fg-muted border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide">
            Suggested
          </div>
          <div className="border-border-subtle divide-border-subtle divide-y overflow-hidden rounded-b-xl border border-t-0">
            {candidates.map((item) => {
              const isExpanding = expandedKey === item.key;
              return (
                <div key={item.key}>
                  <div className="flex items-center justify-between px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.description}</p>
                      <p className="text-fg-muted truncate text-xs">
                        {accountNames[item.accountId] ?? item.accountId} ·{" "}
                        {freqLabel(item.frequency)} · {item.occurrences.length} times ·{" "}
                        {nextExpectedLabel(item.nextExpected)}
                      </p>
                    </div>
                    <div className="ml-4 flex shrink-0 items-center gap-2">
                      <span className="text-fg-muted tabular-nums">
                        {item.amountNative < 0 ? "−" : "+"}
                        {fmt(Math.abs(item.amountNative), item.currency)}
                      </span>
                      <button
                        onClick={() =>
                          isExpanding
                            ? closeForm()
                            : openForm(item.key, defaultFormFromCandidate(item))
                        }
                        className="border-border-subtle hover:bg-border-subtle rounded border px-2 py-1 text-xs"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => void handleDismiss(item.key)}
                        className="text-fg-muted hover:text-red-500 text-xs"
                        title="Dismiss"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  {isExpanding && (
                    <InlineForm
                      onSave={() =>
                        void handleSave({
                          mode: "confirm",
                          detectionKey: item.key,
                          candidateCurrency: item.currency,
                          amountSign: item.amountNative < 0 ? -1 : 1,
                        })
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {subs.length === 0 && candidates.length === 0 && (
        <p className="text-fg-muted text-sm">
          No recurring transactions detected in the last 3 months.
        </p>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run all unit tests**

```bash
pnpm test:unit
```

Expected: all tests pass (includes `recurring.test.ts` and `recurring-budget.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/app/recurring/
git commit -m "feat(recurring): subscription management UI with budget integration"
```
