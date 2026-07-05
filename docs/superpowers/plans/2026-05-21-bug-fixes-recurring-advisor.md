# Bug Fixes: Recurring Hydration + Advisor Send Errors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two broken features: recurring tab buttons that do nothing (React hydration failure) and advisor messages that silently fail on API errors.

**Architecture:** Two independent fixes. Recurring: serialize `RecurringItem` candidates to a plain `SerializedCandidate` type (ISO strings + count instead of Date objects) before crossing the RSC boundary, and compute `today` using UTC. Advisor: add `res.ok` guards after both fetch calls in `sendMessage` so the existing catch block actually fires on HTTP errors.

**Tech Stack:** Next.js 15 App Router, React 18 (`"use client"`), TypeScript, Tailwind CSS.

---

## File Map

| File                                   | Action | Purpose                                                                                                                     |
| -------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| `src/app/recurring/recurring-view.tsx` | Modify | Export `SerializedCandidate`, update props/state type, fix `nextExpectedLabel`, fix `defaultFormFromCandidate`, fix `today` |
| `src/app/recurring/page.tsx`           | Modify | Import `SerializedCandidate`, serialize candidates before passing as prop                                                   |
| `src/app/advisor/c/[id]/chat-view.tsx` | Modify | Add `res.ok` checks after POST and GET fetches                                                                              |

---

### Task 1: Fix recurring hydration failure

**Files:**

- Modify: `src/app/recurring/recurring-view.tsx`
- Modify: `src/app/recurring/page.tsx`

**Context:** `RecurringItem` from `@/lib/recurring/detect` contains `occurrences: Date[]`, `lastDate: Date`, and `nextExpected: Date`. Passing these through the RSC boundary (server page → client component) causes two hydration mismatches: (1) `Date.now()` called during render differs between server SSR and client hydration; (2) `today` uses `getFullYear()/getMonth()/getDate()` which gives UTC on server and local timezone on client. Either mismatch can prevent React from attaching event handlers. The fix: serialize candidates to plain strings/numbers in `page.tsx` before passing to `RecurringView`.

- [ ] **Step 1: Add `SerializedCandidate` interface and update `RecurringViewProps` in `recurring-view.tsx`**

Open `src/app/recurring/recurring-view.tsx`. Make these changes:

**a.** Replace the import line:

```typescript
import type { RecurringItem, Frequency } from "@/lib/recurring/detect";
```

With (drop `RecurringItem`, keep `Frequency`):

```typescript
import type { Frequency } from "@/lib/recurring/detect";
```

**b.** After the `import type { Frequency }` line, add the exported interface:

```typescript
export interface SerializedCandidate {
  key: string;
  description: string;
  accountId: string;
  frequency: Frequency;
  amountNative: number;
  currency: string;
  occurrenceCount: number;
  nextExpected: string; // YYYY-MM-DD ISO date string
}
```

**c.** In `RecurringViewProps`, change `candidates: RecurringItem[]` to:

```typescript
  candidates: SerializedCandidate[];
```

**d.** In `RecurringView` function body, change the state initialisation for `candidates`:

```typescript
const [candidates, setCandidates] = useState<SerializedCandidate[]>(initialCandidates);
```

- [ ] **Step 2: Fix `nextExpectedLabel` to accept a string**

In `recurring-view.tsx`, replace the existing `nextExpectedLabel` function:

```typescript
function nextExpectedLabel(nextExpected: Date): string {
  const diff = Math.round((nextExpected.getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "due today";
  return `due in ${diff}d`;
}
```

With:

```typescript
function nextExpectedLabel(nextExpected: string): string {
  const diff = Math.round((new Date(nextExpected).getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "due today";
  return `due in ${diff}d`;
}
```

- [ ] **Step 3: Fix `defaultFormFromCandidate` to accept `SerializedCandidate`**

In `recurring-view.tsx`, replace:

```typescript
function defaultFormFromCandidate(item: RecurringItem): FormState {
  return {
    name: item.description,
    amount: String(Math.abs(item.amountNative) / 100),
    frequency: item.frequency,
    categoryId: "",
    nextDue: item.nextExpected.toISOString().slice(0, 10),
  };
}
```

With:

```typescript
function defaultFormFromCandidate(item: SerializedCandidate): FormState {
  return {
    name: item.description,
    amount: String(Math.abs(item.amountNative) / 100),
    frequency: item.frequency,
    categoryId: "",
    nextDue: item.nextExpected, // already a YYYY-MM-DD string
  };
}
```

- [ ] **Step 4: Fix `today` computation and replace `item.occurrences.length`**

In `recurring-view.tsx`:

**a.** In `RecurringView` function body, **before the `return` statement**, add (after the `sortedSubs`/`groupedSubs` block):

```typescript
const today = new Date().toISOString().slice(0, 10);
```

**b.** Inside the confirmed subs JSX (inside the `items.map((sub) => { ... })` callback), **remove** these three lines:

```typescript
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
```

The `today` constant defined in step (a) is in scope for the entire component render.

**c.** In the candidates JSX section, find:

```typescript
{item.occurrences.length} times ·{" "}
```

Replace with:

```typescript
{item.occurrenceCount} times ·{" "}
```

- [ ] **Step 5: Update `page.tsx` to serialize candidates**

Open `src/app/recurring/page.tsx`. Make these changes:

**a.** Update the import for `recurring-view`:

```typescript
import { RecurringView } from "./recurring-view";
```

Replace with:

```typescript
import { RecurringView, type SerializedCandidate } from "./recurring-view";
```

**b.** After this existing block (which filters `allDetected` into `candidates`):

```typescript
const candidates = allDetected.filter(
  (r) => !confirmedKeys.has(r.key) && !dismissedKeys.has(r.key),
);
```

Add immediately after:

```typescript
const serializedCandidates: SerializedCandidate[] = candidates.map((c) => ({
  key: c.key,
  description: c.description,
  accountId: c.accountId,
  frequency: c.frequency,
  amountNative: c.amountNative,
  currency: c.currency,
  occurrenceCount: c.occurrences.length,
  nextExpected: c.nextExpected.toISOString().slice(0, 10),
}));
```

**c.** In the `return` JSX, change:

```typescript
candidates = { candidates };
```

To:

```typescript
candidates = { serializedCandidates };
```

- [ ] **Step 6: Run TypeScript check**

```bash
pnpm typecheck 2>&1 | grep -E "error TS|src/app/recurring"
```

Expected: no errors relating to `recurring/page.tsx` or `recurring/recurring-view.tsx`. If errors appear, they will name the exact line — fix them before continuing.

- [ ] **Step 7: Run unit tests to verify no regressions**

```bash
pnpm test:unit 2>&1 | tail -15
```

Expected: all tests pass (128 passing). `detectRecurring` is tested in `tests/unit/recurring.test.ts` — those tests must still pass since we didn't touch `detect.ts`.

- [ ] **Step 8: Commit**

```bash
git add src/app/recurring/recurring-view.tsx src/app/recurring/page.tsx
git commit -m "fix(recurring): serialize candidates at RSC boundary, fix today UTC"
```

---

### Task 2: Fix advisor send error handling

**Files:**

- Modify: `src/app/advisor/c/[id]/chat-view.tsx`

**Context:** `fetch()` in JavaScript resolves (does not throw) on HTTP 4xx/5xx responses. In `sendMessage()`, the POST to `/api/advisor/conversations/${id}/messages` can return 500 (e.g., invalid `MODEL_ADVISOR` env var). Without an `res.ok` check, the code continues to the reload GET and calls `setData(updated)` — the optimistic user bubble is replaced with the server state (no AI reply visible), and no error is shown. The `catch` block only fires on network errors. The fix is to check `res.ok` immediately after both fetches so the catch block fires on API errors.

- [ ] **Step 1: Add `res.ok` check after the POST fetch**

Open `src/app/advisor/c/[id]/chat-view.tsx`. In `sendMessage()`, find:

```typescript
    try {
      await fetch(`/api/advisor/conversations/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      // Reload full conversation
      const updated = await fetch(`/api/advisor/conversations/${id}`).then(
        (r) => r.json() as Promise<ConversationData>,
      );
      setData(updated);
      setProposals(updated.proposals);
```

Replace with:

```typescript
    try {
      const res = await fetch(`/api/advisor/conversations/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        throw new Error(`Send failed: ${res.status}`);
      }

      // Reload full conversation
      const getRes = await fetch(`/api/advisor/conversations/${id}`);
      if (!getRes.ok) {
        throw new Error(`Reload failed: ${getRes.status}`);
      }
      const updated = await getRes.json() as ConversationData;
      setData(updated);
      setProposals(updated.proposals);
```

The existing `catch` block already handles this correctly:

```typescript
    } catch (e) {
      console.error(e);
      setInput(text); // restore input
      setData((prev) =>
        prev ? { ...prev, messages: prev.messages.filter((m) => m.id !== optimisticId) } : prev,
      );
      setSendError("Failed to send. Please try again.");
    }
```

No changes needed to the catch block.

- [ ] **Step 2: Run TypeScript check**

```bash
pnpm typecheck 2>&1 | grep -E "error TS|chat-view"
```

Expected: no errors. The `ConversationData` type is already imported; `getRes.json()` returns `unknown` which we cast explicitly — same pattern as before.

- [ ] **Step 3: Run unit tests**

```bash
pnpm test:unit 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/advisor/c/[id]/chat-view.tsx
git commit -m "fix(advisor): throw on non-ok fetch responses so catch block fires"
```

---

### Task 3: Smoke-test both fixes

No code changes. Manual verification only.

- [ ] **Step 1: Verify `MODEL_ADVISOR` is correct in `.env`**

```bash
grep MODEL_ADVISOR .env
```

Expected output: `MODEL_ADVISOR=claude-sonnet-4-6`

If it shows anything else (e.g., `claude-opus-4-7-sonnet-20260219`), fix it to `MODEL_ADVISOR=claude-sonnet-4-6` in `.env` before proceeding.

- [ ] **Step 2: Restart dev server**

Stop any running `pnpm dev` (Ctrl+C), then:

```bash
pnpm dev
```

Required because env vars are cached in memory. The corrected `MODEL_ADVISOR` must be loaded fresh.

- [ ] **Step 3: Test recurring buttons**

Navigate to `http://localhost:3000/recurring`.

Verify:

1. The page loads without a blank white screen or React error overlay
2. Clicking ✏ on a confirmed subscription opens the inline edit form
3. Clicking × on a confirmed subscription removes it from the list
4. If there are suggested candidates, clicking Dismiss (×) removes the candidate row
5. If there are suggested candidates, clicking Confirm opens the inline confirm form
6. The browser console shows no hydration warnings related to `today` or `nextExpected`

- [ ] **Step 4: Test advisor send**

Navigate to `http://localhost:3000/advisor`, create a new conversation, type a message and click Send (or press Enter).

Verify:

1. The user message bubble appears immediately (optimistic)
2. The "Thinking…" spinner appears
3. After a few seconds, the advisor replies with substantive content
4. No error message ("Failed to send. Please try again.") appears on a successful send
5. The browser console shows no unhandled promise rejections

- [ ] **Step 5: Test advisor error state (optional — only if you can force a bad model)**

Temporarily set `MODEL_ADVISOR=bad-model-name` in `.env`, restart dev server, send a message.

Verify:

1. The user message bubble appears (optimistic)
2. After a moment, the "Thinking…" spinner disappears
3. The error message "Failed to send. Please try again." appears below the send box
4. The input textarea is restored with the original message text
5. The optimistic user bubble is removed

Restore `MODEL_ADVISOR=claude-sonnet-4-6` and restart dev server after this test.
