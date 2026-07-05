# Bug Fixes: Recurring Hydration + Advisor Send Errors

## Summary

Two bugs causing complete failure of interactive features:

1. **Recurring tab buttons do nothing** — React hydration failure due to non-serializable `Date` objects in `RecurringItem` props passed from server → client component, plus `today` computed with local timezone instead of UTC.
2. **Advisor send/receive broken** — `fetch()` does not throw on HTTP 4xx/5xx, so the `catch` block never fires on API errors; errors are swallowed silently and the conversation reloads without the AI reply.

---

## Bug 1 — Recurring Hydration Failure

### Root Cause

`src/app/recurring/page.tsx` (Server Component) passes `candidates: RecurringItem[]` to `RecurringView` (Client Component, `"use client"`). `RecurringItem` contains:

- `occurrences: Date[]` — array of Date objects
- `lastDate: Date` — Date object
- `nextExpected: Date` — Date object

Even if React's RSC protocol serializes these correctly, two issues cause hydration mismatches:

1. `nextExpectedLabel(item.nextExpected)` calls `Date.now()` during render — server evaluates at SSR time T1, client evaluates at hydration time T2, producing a different text node.
2. `today` is computed inside the subscription `.map()` using `getFullYear()`, `getMonth()`, `getDate()` — local-timezone methods. Server runs in UTC; client runs in user's local timezone. For users outside UTC, `today` differs between server and client, causing `dueSoon` (a boolean used in `className`) to mismatch. React detects the attribute mismatch and can fail to attach event handlers to the entire component subtree.

### Fix: Serialize at the RSC Boundary (Option A)

**In `src/app/recurring/page.tsx`:** Map `RecurringItem[]` to a plain serializable type before passing as props. No Dates, no arrays of Dates.

New serialized shape (inline in `page.tsx`):

```typescript
interface SerializedCandidate {
  key: string;
  description: string;
  accountId: string;
  frequency: Frequency;
  amountNative: number;
  currency: string;
  occurrenceCount: number; // was: occurrences: Date[]
  nextExpected: string; // ISO YYYY-MM-DD string, was: Date
}
```

Mapping:

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

**In `src/app/recurring/recurring-view.tsx`:**

- Remove `import type { RecurringItem, Frequency }` for `RecurringItem` specifically; keep `Frequency`.
- Add `SerializedCandidate` interface (same shape as above, defined locally or re-exported from page — define locally in the view file to keep things self-contained).
- Update `RecurringViewProps.candidates` from `RecurringItem[]` to `SerializedCandidate[]`.
- Update `useState<RecurringItem[]>` → `useState<SerializedCandidate[]>`.
- Update `nextExpectedLabel` to accept `string` instead of `Date`:
  ```typescript
  function nextExpectedLabel(nextExpected: string): string {
    const diff = Math.round((new Date(nextExpected).getTime() - Date.now()) / 86_400_000);
    ...
  }
  ```
- Update `defaultFormFromCandidate` to use `item.nextExpected` directly (already a `YYYY-MM-DD` string):
  ```typescript
  function defaultFormFromCandidate(item: SerializedCandidate): FormState {
    return {
      name: item.description,
      amount: String(Math.abs(item.amountNative) / 100),
      frequency: item.frequency,
      categoryId: "",
      nextDue: item.nextExpected, // no longer need .toISOString().slice(0,10)
    };
  }
  ```
- Replace `item.occurrences.length` in JSX with `item.occurrenceCount`.
- Fix `today` computation (used in confirmed subs `.map()`) to use UTC:
  ```typescript
  const today = new Date().toISOString().slice(0, 10);
  ```
  Move it outside the `.map()` (compute once, not per-item).

---

## Bug 2 — Advisor Send Swallows Errors

### Root Cause

In `src/app/advisor/c/[id]/chat-view.tsx`, `sendMessage()`:

```typescript
try {
  await fetch(`/api/advisor/conversations/${id}/messages`, { method: "POST", ... });
  // ↑ fetch() resolves on 500 — no throw, code continues
  const updated = await fetch(`/api/advisor/conversations/${id}`).then(r => r.json() ...);
  setData(updated);  // loads conversation without the AI reply
} catch (e) { ... }  // never fires on HTTP errors
```

When the API returns 500 (e.g., invalid `MODEL_ADVISOR`), `fetch` resolves normally. The catch block never fires. The GET succeeds, and `setData(updated)` overwrites the optimistic user bubble with the server state (which has the user message saved to DB but no AI reply). The user sees the message disappear with no error shown.

### Fix

Add `res.ok` checks after both fetches:

```typescript
const res = await fetch(`/api/advisor/conversations/${id}/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: text }),
});
if (!res.ok) {
  throw new Error(`Send failed: ${res.status}`);
}

const getRes = await fetch(`/api/advisor/conversations/${id}`);
if (!getRes.ok) {
  throw new Error(`Reload failed: ${getRes.status}`);
}
const updated = (await getRes.json()) as ConversationData;
setData(updated);
setProposals(updated.proposals);
```

The existing `catch` block already handles this correctly — it restores the input, removes the optimistic message, and sets `sendError`. No other changes needed.

---

## Files Changed

| File                                   | Change                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/recurring/page.tsx`           | Add `SerializedCandidate` interface, map `candidates` to serialized form                                                       |
| `src/app/recurring/recurring-view.tsx` | Use `SerializedCandidate`, fix `nextExpectedLabel`, fix `defaultFormFromCandidate`, fix `today`, remove `RecurringItem` import |
| `src/app/advisor/c/[id]/chat-view.tsx` | Add `res.ok` checks after POST and GET fetches                                                                                 |

No DB changes. No new API routes. No migrations.

---

## Testing

- **Recurring:** Click ×, ✏, Confirm, and Dismiss buttons — all must respond. Verify `today` is computed as UTC date string. Verify `occurrenceCount` renders correctly.
- **Advisor:** With `MODEL_ADVISOR` correctly set, send a message and verify AI reply appears. With an invalid model, verify error message appears and input is restored.
- **Regression:** All 128 unit tests must continue to pass (`pnpm test:unit`).
