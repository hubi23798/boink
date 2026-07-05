# Advisor Integration Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI advisor end-to-end usable — add a `get_subscriptions` tool, surface a prompt card on the home screen, and pre-fill the chat view from a URL param.

**Architecture:** Four targeted file changes; no new DB tables, no new API routes, no new migrations. The `get_subscriptions` tool follows the existing chained-query pattern in `tools.ts`. The home prompt card uses a server action (same pattern as the existing `createConversation` action in `advisor/page.tsx`). Pre-fill passes a `?q=` URL param from the server action redirect into the chat view's initial textarea state.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, PostgreSQL, Vitest, Tailwind CSS, TypeScript.

---

## File Map

| File                                   | Action | Purpose                                                                  |
| -------------------------------------- | ------ | ------------------------------------------------------------------------ |
| `src/lib/advisor/tools.ts`             | Modify | Add `get_subscriptions` tool definition + executor                       |
| `tests/unit/advisor-tools.test.ts`     | Modify | Add tests for `get_subscriptions`                                        |
| `src/app/page.tsx`                     | Modify | Add advisor prompt card + `createConversationWithQuestion` server action |
| `src/app/advisor/c/[id]/page.tsx`      | Modify | Read `searchParams.q`, pass as `initialMessage` to ChatView              |
| `src/app/advisor/c/[id]/chat-view.tsx` | Modify | Accept + initialise `initialMessage` prop                                |

---

### Task 1: Add `get_subscriptions` tool to the advisor

**Files:**

- Modify: `src/lib/advisor/tools.ts`
- Modify: `tests/unit/advisor-tools.test.ts`

The tool reads confirmed subscriptions from `recurring_subscription`, left-joins `category` for names, and computes a `totalMonthly` figure normalised from weekly/fortnightly/monthly amounts.

Normalisation multipliers:

- `monthly`: × 1
- `fortnightly`: × (26 / 12) ≈ × 2.1667
- `weekly`: × (52 / 12) ≈ × 4.3333

- [ ] **Step 1: Write the failing test**

Add this `describe` block at the bottom of `tests/unit/advisor-tools.test.ts`:

```typescript
describe("executeTool — get_subscriptions", () => {
  it("returns subscriptions with totalMonthly normalised", async () => {
    const ctx = makeCtx();
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        {
          id: "sub-1",
          name: "Netflix",
          frequency: "monthly",
          amountNative: 1599,
          currency: "EUR",
          nextDue: "2026-06-01",
          categoryName: "Entertainment",
        },
        {
          id: "sub-2",
          name: "Gym",
          frequency: "weekly",
          amountNative: 1000,
          currency: "EUR",
          nextDue: "2026-05-27",
          categoryName: null,
        },
      ]),
    };
    (ctx.db as unknown as Record<string, unknown>).select = vi.fn().mockReturnValue(selectChain);

    const result = (await executeTool("get_subscriptions", {}, ctx)) as {
      subscriptions: Array<{
        name: string;
        frequency: string;
        amount: number;
        currency: string;
        nextDue: string | null;
        category: string | null;
      }>;
      totalMonthly: number;
    };

    expect(result.subscriptions).toHaveLength(2);
    expect(result.subscriptions[0]).toEqual({
      name: "Netflix",
      frequency: "monthly",
      amount: 1599,
      currency: "EUR",
      nextDue: "2026-06-01",
      category: "Entertainment",
    });
    expect(result.subscriptions[1]).toEqual({
      name: "Gym",
      frequency: "weekly",
      amount: 1000,
      currency: "EUR",
      nextDue: "2026-05-27",
      category: null,
    });
    // totalMonthly: 1599 (monthly) + 1000 * 52/12 (weekly) = 1599 + 4333.33... = 5932 (rounded)
    expect(result.totalMonthly).toBe(Math.round(1599 + 1000 * (52 / 12)));
  });

  it("returns empty list and zero totalMonthly when no subscriptions", async () => {
    const ctx = makeCtx();
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    (ctx.db as unknown as Record<string, unknown>).select = vi.fn().mockReturnValue(selectChain);

    const result = (await executeTool("get_subscriptions", {}, ctx)) as {
      subscriptions: unknown[];
      totalMonthly: number;
    };
    expect(result.subscriptions).toHaveLength(0);
    expect(result.totalMonthly).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test:unit -- --reporter=verbose 2>&1 | grep -A 3 "get_subscriptions"
```

Expected: two failing tests — `executeTool — get_subscriptions` with "Unknown tool: get_subscriptions".

- [ ] **Step 3: Add the tool to `src/lib/advisor/tools.ts`**

**3a.** Add the import for `recurringSubscription` at the top of the imports block. Find the existing import:

```typescript
import { PRIMARY_USER_ID, account, budgetTarget, category, transaction } from "@/lib/db/schema";
```

Replace with:

```typescript
import {
  PRIMARY_USER_ID,
  account,
  budgetTarget,
  category,
  recurringSubscription,
  transaction,
} from "@/lib/db/schema";
```

**3b.** Add the tool definition. Find the `propose_categorization_rule` entry (the last item) in `TOOL_DEFINITIONS` and insert a new entry **before** it. The array currently ends with:

```typescript
  {
    name: "propose_categorization_rule",
```

Insert this block before that entry (add a comma after the preceding `get_spending_by_category` closing brace if needed — it already has one):

```typescript
  {
    name: "get_subscriptions",
    description:
      "Returns all confirmed recurring subscriptions (bills, services) the user has set up. Includes name, frequency, amount, next due date, and category. Also returns a totalMonthly figure normalising all amounts to monthly.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
```

**3c.** Add the executor function. After `executeGetSpendingByCategory` and before `executeProposeCategorizationRule`, add:

```typescript
async function executeGetSubscriptions(ctx: ToolContext): Promise<unknown> {
  const MONTHLY_MULTIPLIER: Record<string, number> = {
    monthly: 1,
    fortnightly: 26 / 12,
    weekly: 52 / 12,
  };

  const rows = await ctx.db
    .select({
      id: recurringSubscription.id,
      name: recurringSubscription.name,
      frequency: recurringSubscription.frequency,
      amountNative: recurringSubscription.amountNative,
      currency: recurringSubscription.currency,
      nextDue: recurringSubscription.nextDue,
      categoryName: category.name,
    })
    .from(recurringSubscription)
    .leftJoin(category, eq(recurringSubscription.categoryId, category.id))
    .where(eq(recurringSubscription.userId, PRIMARY_USER_ID));

  let totalMonthly = 0;
  const subscriptions = rows.map((row) => {
    const multiplier = MONTHLY_MULTIPLIER[row.frequency] ?? 1;
    totalMonthly += row.amountNative * multiplier;
    return {
      name: row.name,
      frequency: row.frequency,
      amount: row.amountNative,
      currency: row.currency,
      nextDue: row.nextDue ?? null,
      category: row.categoryName ?? null,
    };
  });

  return { subscriptions, totalMonthly: Math.round(totalMonthly) };
}
```

**3d.** Add the case to the `executeTool` switch. Find:

```typescript
    case "get_spending_by_category":
      return executeGetSpendingByCategory(input, ctx);
    case "propose_categorization_rule":
```

Replace with:

```typescript
    case "get_spending_by_category":
      return executeGetSpendingByCategory(input, ctx);
    case "get_subscriptions":
      return executeGetSubscriptions(ctx);
    case "propose_categorization_rule":
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test:unit -- --reporter=verbose 2>&1 | grep -A 3 "get_subscriptions"
```

Expected: both `get_subscriptions` tests PASS.

- [ ] **Step 5: Run the full test suite**

```bash
pnpm test:unit 2>&1 | tail -20
```

Expected: all tests pass, no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/lib/advisor/tools.ts tests/unit/advisor-tools.test.ts
git commit -m "feat(advisor): add get_subscriptions tool"
```

---

### Task 2: Add advisor prompt card to home screen

**Files:**

- Modify: `src/app/page.tsx`

Adds a "Ask your advisor" section with three suggested starter questions. Each question is a `<form>` that calls a server action which creates a new conversation and redirects to the chat view with `?q=<question>` pre-filled.

The server action follows the exact same pattern as `createConversation` in `src/app/advisor/page.tsx` — reads session cookie, authenticates, inserts into `advisorConversation`, then redirects.

- [ ] **Step 1: Add the server action and prompt card section to `src/app/page.tsx`**

Find the existing import block at the top of the file. Add `advisorConversation` and `PRIMARY_USER_ID` to the schema import. The current import is:

```typescript
import { transaction } from "@/lib/db/schema";
```

Replace with:

```typescript
import { advisorConversation, PRIMARY_USER_ID, transaction } from "@/lib/db/schema";
```

Next, locate the closing `</main>` tag at the end of the JSX. The current structure ends with the Quick links section:

```typescript
      {/* Quick links */}
      <section className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
```

**Before** the Quick links section, insert the advisor prompt card and server action. Add the server action function inside the component (same pattern as advisor/page.tsx), then the JSX section.

Find this exact line:

```typescript
{
  /* Quick links */
}
```

Insert before it:

```typescript
      {/* Advisor prompt card */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Ask your advisor</h2>
          <a href="/advisor" className="text-fg-muted text-xs hover:underline">
            Open advisor →
          </a>
        </div>
        <div className="border-border-subtle divide-border-subtle divide-y rounded-xl border text-sm">
          {(
            [
              "How did I do this month?",
              "Am I on track with my budget?",
              "What are my biggest subscriptions costing me?",
            ] as const
          ).map((q) => (
            <form key={q} action={createConversationWithQuestion.bind(null, q)}>
              <button
                type="submit"
                className="text-fg-muted hover:text-fg-default hover:bg-surface-hover w-full px-4 py-3 text-left transition-colors"
              >
                {q}
              </button>
            </form>
          ))}
        </div>
      </section>

```

Now add the server action inside `HomePage` (after the data-fetching `await` block, before the `return`). Find the line:

```typescript
const netDelta = thisMo.net - lastMo.net;
```

Insert after it:

```typescript
async function createConversationWithQuestion(q: string) {
  "use server";
  const cookieStore2 = await cookies();
  const sid2 = cookieStore2.get(env().SESSION_COOKIE_NAME)?.value;
  if (!sid2) redirect("/login");
  const db2 = getDb();
  const sess2 = await readSession(db2, sid2);
  if (!sess2) redirect("/login");
  const [conv] = await db2
    .insert(advisorConversation)
    .values({ userId: PRIMARY_USER_ID, title: q.slice(0, 60) })
    .returning({ id: advisorConversation.id });
  redirect(`/advisor/c/${conv!.id}?q=${encodeURIComponent(q)}`);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm build 2>&1 | grep -E "error|Error" | head -20
```

Expected: no TypeScript errors related to the new code. (Build may fail on unrelated warnings — that's fine.)

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(home): add advisor prompt card with starter questions"
```

---

### Task 3: Pre-fill chat view from URL param

**Files:**

- Modify: `src/app/advisor/c/[id]/page.tsx`
- Modify: `src/app/advisor/c/[id]/chat-view.tsx`

When the user is redirected from home with `?q=<question>`, the page reads it and passes it to `ChatView`, which initialises the textarea with the text. The user still clicks Send manually — no auto-submit.

- [ ] **Step 1: Update `src/app/advisor/c/[id]/page.tsx` to read `searchParams.q`**

The current file is minimal — no auth, no DB. Replace the entire file contents with:

```typescript
import { ChatView } from "./chat-view";

export default async function AdvisorChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const { q } = await searchParams;
  return <ChatView id={id} initialMessage={q ?? ""} />;
}
```

- [ ] **Step 2: Update `src/app/advisor/c/[id]/chat-view.tsx` to accept and use `initialMessage`**

Find the `ChatView` function signature:

```typescript
export function ChatView({ id }: { id: string }) {
```

Replace with:

```typescript
export function ChatView({ id, initialMessage = "" }: { id: string; initialMessage?: string }) {
```

Find the `input` state initialisation:

```typescript
const [input, setInput] = useState("");
```

Replace with:

```typescript
const [input, setInput] = useState(initialMessage);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm build 2>&1 | grep -E "error|Error" | head -20
```

Expected: no TypeScript errors related to the new code.

- [ ] **Step 4: Commit**

```bash
git add src/app/advisor/c/[id]/page.tsx src/app/advisor/c/[id]/chat-view.tsx
git commit -m "feat(advisor): pre-fill chat textarea from ?q= URL param"
```

---

### Task 4: Smoke-test the full flow

No code changes. Manual verification only.

- [ ] **Step 1: Restart the dev server** (required — env is cached in memory, must reload to pick up the corrected `MODEL_ADVISOR`)

```bash
# Kill the running dev server (Ctrl+C or kill the process), then:
pnpm dev
```

- [ ] **Step 2: Navigate to the home page**

Open `http://localhost:3000`. Verify the "Ask your advisor" card appears with three clickable questions above the Quick links grid.

- [ ] **Step 3: Click a starter question**

Click "How did I do this month?". Verify:

1. You are redirected to `/advisor/c/<uuid>?q=How+did+I+do+this+month%3F`
2. The textarea is pre-filled with the question text
3. The "Thinking…" spinner is **not** showing (no auto-submit)

- [ ] **Step 4: Send the message**

Click Send (or press Enter). Verify:

1. The optimistic user bubble appears immediately
2. The "Thinking…" bubble appears
3. After a few seconds, the advisor replies with a substantive answer grounded in tool data
4. No 500 error in the browser console or server logs

- [ ] **Step 5: Test `get_subscriptions` via the advisor**

In the same conversation (or a new one), type: "What subscriptions am I paying for?" and send. Verify the advisor calls `get_subscriptions` and references subscription data in its reply. (If you have no confirmed subscriptions yet, the advisor will say so — that's correct behaviour.)

- [ ] **Step 6: Run unit tests one final time**

```bash
pnpm test:unit 2>&1 | tail -10
```

Expected: all tests pass.
