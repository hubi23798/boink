# truffe.ai — Visual Refresh Design Spec

**Brand:** truffe.ai · **Tone:** Clean, modern, trustworthy  
**Stack:** Next.js · Tailwind v4 · shadcn/ui  
**Prepared by:** Design Audit, May 2026

---

## Executive Summary

truffe.ai has a solid functional foundation and a well-structured token system (`surface`, `fg-default`, `fg-muted`, `border-subtle`). The core problems are not architectural — they are presentational. The app currently reads as a developer prototype: a single narrow column, a flat horizontal nav bar with eleven links, no typographic scale, and no visual hierarchy within pages. The proposed refresh does not require a rewrite. It requires a layout upgrade, a typography scale, a spacing rhythm, and a small set of component improvements applied consistently across all five pages.

---

## Navigation: The Root Problem

The single most impactful change in the entire refresh is replacing the horizontal top navigation with a **left sidebar**. The current nav crams eleven links into a single scrollable row at `max-w-2xl`. This creates three compounding problems: it is illegible on mobile, it signals "developer tool" rather than "product," and it forces every page into a narrow single-column layout that wastes horizontal space on desktop.

**Proposed sidebar structure** (7 items, grouped):

| Group    | Items                   |
| -------- | ----------------------- |
| Core     | Home, Wealth, Budget    |
| Activity | Transactions, Recurring |
| Planning | Goals, Advisor          |
| Footer   | Settings                |

The sidebar should be `240px` wide on desktop, collapsing to a bottom tab bar on mobile (5 tabs: Home, Budget, Transactions, Goals, Advisor). The main content area shifts to a `max-w-4xl` two-column layout where appropriate (e.g., Wealth: asset list + chart side by side).

---

## Design System v2

### Color Palette

The existing token system is sound. The only changes are to the accent color and the surface warmth. Replace the current neutral-gray surface with a warm off-white, and replace the purple `--color-accent-brand` (262° hue) with a calm teal that reads as "financial intelligence" rather than "generic SaaS."

| Token                          | Current       | Proposed      | Role                     |
| ------------------------------ | ------------- | ------------- | ------------------------ |
| `--color-surface-raw`          | `0 0% 100%`   | `40 10% 98%`  | Warm off-white `#FAFAF8` |
| `--color-surface-elevated-raw` | `0 0% 98%`    | `0 0% 100%`   | Pure white cards         |
| `--color-accent-brand-raw`     | `262 80% 60%` | `168 48% 33%` | Teal `#2D7D6F`           |
| `--color-success-raw`          | `142 71% 45%` | `142 65% 38%` | Slightly deeper green    |
| `--color-warning-raw`          | `38 92% 50%`  | `38 88% 45%`  | Amber `#D97706`          |

The dark mode tokens require no changes — the existing near-black surface is correct.

### Typography Scale

The current app uses a single font size (`text-sm`, `text-xs`) for nearly all content. There is no display size, no H1 that commands attention, and no clear hierarchy between section headers and body text. The proposed scale introduces five levels:

| Level   | Size | Weight | Usage                                               |
| ------- | ---- | ------ | --------------------------------------------------- |
| Display | 32px | 700    | Net worth hero number, primary KPI                  |
| H1      | 24px | 600    | Page title                                          |
| H2      | 18px | 600    | Section header (e.g., "Housing", "Asset breakdown") |
| Body    | 14px | 400    | Row labels, descriptions                            |
| Caption | 12px | 400    | Muted metadata (dates, account names)               |
| Mono    | 14px | 500    | All financial amounts (tabular-nums)                |

**Font recommendation:** Replace the system font stack with **Geist** (Vercel's open-source typeface). It is clean, legible at small sizes, has excellent tabular figures, and reads as premium software rather than a generic web app. Add via `next/font/google` or CDN. If Geist is unavailable, Inter at `font-feature-settings: "tnum"` is an acceptable fallback.

### Spacing Rhythm

All pages currently use `space-y-6` and `p-6` as the only spacing units. The proposed rhythm is an 8px base grid:

`4px · 8px · 12px · 16px · 24px · 32px · 48px`

Specific applications: card internal padding → `p-4` (16px); row vertical padding → `py-3` (12px); section gap → `gap-6` (24px); page top padding → `pt-8` (32px).

### Card Styles

Three card variants replace the current single bordered `div`:

**Default card** — white background, `border border-border-subtle`, `rounded-xl` (12px), `p-4`, `shadow-sm`. Used for: transaction rows, budget groups, goal cards.

**Elevated card** — white background, no border, `rounded-2xl` (16px), `p-5`, `shadow-md`. Used for: net worth hero, monthly summary, primary KPIs.

**Sunken card** — `bg-surface-sunken`, no border, `rounded-lg` (8px), `p-3`. Used for: filter bars, inline forms, secondary metadata.

---

## Page-by-Page Audit

### Wealth

**Problem 1 — No hero moment.** The net worth number (`€122,400`) is displayed as a plain `div` inside a grid card with no typographic weight. It is the most important number in the entire app and receives no visual emphasis. **Fix:** Promote net worth to a full-width elevated card with a 32px display number, a signed delta badge (`+€2,100 this month` in green), and a sparkline chart to the right.

**Problem 2 — Asset breakdown has no visual encoding.** The four asset cards (Cash, Investments, Pension, Other) are identical gray boxes with no color, no icon, and no percentage share. The user cannot scan their allocation at a glance. **Fix:** Add a color-coded icon per asset class (teal for Cash, blue for Investments, forest green for Pension), show the percentage share in muted text, and arrange as a vertical list rather than a 2×2 grid to allow for more asset classes without layout breaking.

**Problem 3 — Forecast chart is a placeholder.** The `ForecastChart` component renders but has no time-horizon control, no confidence band, and no "Today" marker. It looks unfinished. **Fix:** Add a segmented control for 5y / 10y / 20y, render a confidence band in `teal/10` opacity, and mark the current date with a vertical dashed line.

---

### Budget

**Problem 1 — No monthly summary.** The page opens directly into a category list with no overview of total budgeted vs. total spent. The user must mentally sum all rows to understand their overall position. **Fix:** Add a sticky summary bar at the top of the page showing total budgeted, total spent, a progress arc (percentage of budget used), and remaining amount. This is the single most motivating element in a budget product.

**Problem 2 — Progress bars are invisible.** The current `h-1` (4px) progress bar with `bg-border-subtle` track is barely perceptible. The fill color does not change based on status — it is always the same regardless of whether a category is on track or over budget. **Fix:** Increase bar height to `h-1.5` (6px), use a `bg-surface-sunken` track, and apply three fill colors: `bg-success` under 80%, `bg-warning` 80–100%, `bg-danger` over 100%.

**Problem 3 — Category groups have no visual separation.** The current implementation uses a `border-b` header and then a `divide-y` list that bleeds into the next group without a gap. On a long page, the groups blur together. **Fix:** Wrap each group in a Default card with `mb-4` spacing. The group header becomes the card header with a left-border accent in the group's semantic color.

---

### Transactions

**Problem 1 — Filter bar uses native HTML controls.** The `<select>` dropdowns and `<input type="date">` fields are rendered as native browser controls with inconsistent styling across platforms. On macOS Safari and iOS they look especially out of place. **Fix:** Replace with pill-shaped filter chips using shadcn `Popover` + `Command` for account/category selection, and a `DateRangePicker` for date filtering. Active filters show a close `×` button inside the chip.

**Problem 2 — No date grouping.** The transaction list is a flat `divide-y` list ordered by date, but there are no date headers. The user cannot quickly find "what happened yesterday" without scanning timestamps. **Fix:** Group transactions by date with sticky date headers (`Today`, `Yesterday`, `May 19`). Each date header shows the count and net total for that day on the right.

**Problem 3 — No visual identity per transaction.** Every row looks identical — plain text, no icon, no category color. The eye has nothing to anchor on when scanning. **Fix:** Add a 32px category icon circle on the left of each row (using the first letter of the category name on a teal background as a fallback). Show the category as a small pill tag rather than muted inline text.

---

### Goals

**Problem 1 — Goal type is invisible.** All goals look identical regardless of whether they are an emergency fund, a house deposit, or a debt payoff. The `kind` field exists in the data model but is not surfaced visually. **Fix:** Add a 40px icon in a rounded square per goal type: piggy bank (green) for `cash_target`/`emergency_fund`, chart (blue) for `portfolio_target`, document (red) for `debt_payoff`.

**Problem 2 — Progress bar is thin and unsatisfying.** The `h-1` bar on goal cards provides no sense of momentum. For a savings goal, the progress bar is the primary motivational element. **Fix:** Increase to `h-2` (8px), use the goal type's color, and add a percentage label to the right of the bar.

**Problem 3 — Required monthly savings is buried.** The `requiredMonthly` value from `GoalProgress` is not shown on the goal card in the current implementation. This is the most actionable piece of information — it tells the user exactly what they need to do. **Fix:** Surface it as a teal badge below the progress bar: `Required monthly: €625`.

---

### Recurring

**Problem 1 — No merchant context.** Subscription rows show only the raw description string (e.g., `NETFLIX.COM`) with no logo, no formatted name, and no visual differentiation. **Fix:** Add a 32px merchant logo circle (using initial letter as fallback). Format names with title case. Show next payment date in muted caption text.

**Problem 2 — Suggested section lacks urgency.** The "Suggested" candidates section uses the same visual treatment as confirmed subscriptions. The user has no reason to act on it. **Fix:** Give the Suggested section a distinct amber-tinted surface (`bg-warning/5`), a warning icon in the header, and make the Confirm button a filled teal primary button rather than a bordered ghost button.

**Problem 3 — Budget conflict prompt is inline and easy to miss.** When a subscription conflicts with an existing budget target, the conflict message appears as a small bordered `div` below the row. It is easy to scroll past. **Fix:** Promote to a modal dialog triggered by a yellow warning badge on the subscription row.

---

## Navigation Model

### Desktop (≥1024px)

```
┌─────────────────────────────────────────────────────┐
│  [truffe.ai logo]                                    │
│  ─────────────────                                   │
│  ○ Home                  │  [Page content]           │
│  ○ Wealth                │  max-w-4xl                │
│  ○ Budget                │  two-column where needed  │
│  ─────────────────       │                           │
│  ○ Transactions          │                           │
│  ○ Recurring             │                           │
│  ─────────────────       │                           │
│  ○ Goals                 │                           │
│  ○ Advisor               │                           │
│  ─────────────────       │                           │
│  ○ Settings (footer)     │                           │
└─────────────────────────────────────────────────────┘
```

Sidebar width: `w-60` (240px). Active item: `bg-teal/10 text-teal font-medium rounded-lg`. Inactive: `text-fg-muted hover:text-fg-default hover:bg-surface-elevated`.

### Mobile (< 768px)

Bottom tab bar with 5 items: **Home · Budget · Transactions · Goals · Advisor**. Remaining pages (Wealth, Recurring, Settings) accessible from Home via card links. Tab bar height: `h-16` with safe-area padding for iPhone notch. Active tab: teal icon + label. Inactive: muted icon, no label.

---

## Implementation Priority

The following changes are ordered by impact-to-effort ratio. Each can be shipped independently without breaking existing functionality.

| Priority | Change                                       | Effort | Impact    |
| -------- | -------------------------------------------- | ------ | --------- |
| 1        | Replace horizontal nav with sidebar          | Medium | Very High |
| 2        | Add typography scale (Display, H1, H2)       | Low    | High      |
| 3        | Warm up surface color + replace accent       | Low    | High      |
| 4        | Budget monthly summary bar                   | Low    | High      |
| 5        | Progress bar height + color coding           | Low    | High      |
| 6        | Wealth net worth hero card                   | Low    | High      |
| 7        | Transaction date grouping                    | Medium | Medium    |
| 8        | Goal type icons + required monthly badge     | Low    | Medium    |
| 9        | Recurring merchant logos + Suggested section | Medium | Medium    |
| 10       | Filter chip components (Transactions)        | High   | Medium    |

---

## globals.css Token Changes

The following is the minimal diff to `globals.css` to implement the color changes. No existing tokens are removed — only the accent brand and surface warmth are updated.

```css
:root {
  /* CHANGE: warm off-white surface */
  --color-surface-raw: 40 10% 98%; /* was: 0 0% 100% */
  --color-surface-elevated-raw: 0 0% 100%; /* was: 0 0% 98% */

  /* CHANGE: teal accent replaces purple */
  --color-accent-brand-raw: 168 48% 33%; /* was: 262 80% 60% */
}
```

All other tokens (`fg-default`, `fg-muted`, `border-subtle`, semantic states) remain unchanged. The shadcn/ui baseline tokens (`--background`, `--primary`, etc.) should be aligned to the cockpit palette in a follow-up pass as noted in the existing TODO comment in `globals.css`.

---

## Typography Implementation

Add to `client/index.html` or `layout.tsx`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap"
  rel="stylesheet"
/>
```

Add to `globals.css`:

```css
@layer base {
  body {
    font-family: "Geist", "Inter", system-ui, sans-serif;
    font-feature-settings: "tnum" 0; /* disable by default */
  }
  .tabular-nums {
    font-feature-settings: "tnum" 1; /* enable for financial figures */
  }
}
```

---

_All before/after visual comparisons are provided as separate image attachments._
