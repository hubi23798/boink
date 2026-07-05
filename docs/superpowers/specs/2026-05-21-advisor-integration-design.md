# Advisor Integration Pass — Design Spec

**Date:** 2026-05-21
**Phase:** D

## Goal

Make the AI advisor end-to-end usable by fixing the broken model string, giving the advisor visibility into confirmed subscriptions, and surfacing it on the home screen with pre-filled starter questions.

---

## Architecture

No new DB tables. No new API routes. Changes span four files:

| File                                   | Change                                     |
| -------------------------------------- | ------------------------------------------ |
| `src/lib/advisor/tools.ts`             | Add `get_subscriptions` tool + executor    |
| `src/app/page.tsx`                     | Add advisor prompt card with server action |
| `src/app/advisor/c/[id]/page.tsx`      | Read `searchParams.q`, pass to ChatView    |
| `src/app/advisor/c/[id]/chat-view.tsx` | Accept + initialize `initialMessage` prop  |

---

## Components

### 1. `get_subscriptions` tool

New read tool added to the advisor's tool catalog.

**Input schema:** none (no params — always returns all confirmed subscriptions for the user).

**Output:**

```json
{
  "subscriptions": [
    {
      "name": "Netflix",
      "frequency": "monthly",
      "amount": 1599,
      "currency": "EUR",
      "nextDue": "2026-06-01",
      "category": "Entertainment"
    }
  ],
  "totalMonthly": 4299
}
```

- `amount` is in base-currency minor units (cents), consistent with all other tools.
- `totalMonthly` normalises weekly/annual amounts to monthly for a quick summary figure. Weekly × 4.33, annual ÷ 12.
- `category` is the category name if set, otherwise `null`.
- Added to `TOOL_DEFINITIONS` array and `executeTool` switch. No `cache_control` (data changes frequently).

### 2. Advisor prompt card on home

New `<section>` in `src/app/page.tsx`, placed above the "Quick links" grid.

Three starter questions hard-coded:

- "How did I do this month?"
- "Am I on track with my budget?"
- "What are my biggest subscriptions costing me?"

Each question is a `<form>` with a hidden `q` input that calls a server action `createConversationWithQuestion`. The action:

1. Authenticates (reads session cookie, same pattern as the existing `createConversation` in advisor/page.tsx).
2. Inserts a row into `advisorConversation` with title = the question (truncated to 60 chars).
3. Redirects to `/advisor/c/[id]?q=<encodeURIComponent(question)>`.

The card also includes a plain "Open advisor →" link for users who want to type their own question.

### 3. Pre-fill in chat view

`src/app/advisor/c/[id]/page.tsx` is a server component that already receives `params`. Extend its signature to also read `searchParams`:

```tsx
export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
});
```

Pass `initialMessage={q ?? ""}` to `<ChatView>`.

`ChatView` gains an `initialMessage?: string` prop. The `input` state is initialised with it:

```tsx
const [input, setInput] = useState(initialMessage ?? "");
```

No auto-send. The user sees the question pre-filled in the textarea and clicks Send (or edits it first).

---

## Data flow

```
Home page
  └─ User clicks "How did I do this month?"
       └─ <form> POST → createConversationWithQuestion("How did I do this month?")
            └─ INSERT advisorConversation, title="How did I do this month?"
                 └─ redirect("/advisor/c/[id]?q=How+did+I+do+this+month%3F")
                      └─ ConversationPage reads searchParams.q
                           └─ <ChatView initialMessage="How did I do this month?" />
                                └─ textarea pre-filled, user clicks Send
                                     └─ POST /api/advisor/conversations/[id]/messages
                                          └─ runAdvisorTurn → Anthropic API → response
```

---

## Error handling

- `createConversationWithQuestion` uses the same auth guard as the existing advisor server actions. No new error paths.
- If `searchParams.q` is missing or empty, `ChatView` starts with an empty textarea — no behaviour change.
- The `get_subscriptions` tool returns an empty `subscriptions: []` array if no confirmed subscriptions exist. Never throws.

---

## Testing

- Manual: restart dev server, navigate to home, click a starter question, verify pre-fill, send message, verify response.
- Existing advisor unit tests (if any) unaffected — `get_subscriptions` is additive.
- No new DB migration — no migration test needed.

---

## Out of scope

- AI-generated home brief (deferred).
- Auto-submitting the first message (Approach C — deferred).
- Nav badge for pending proposals (deferred).
