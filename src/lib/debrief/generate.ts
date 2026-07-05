import Anthropic from "@anthropic-ai/sdk";
import type { Db } from "@/lib/db/client";
import type { DebriefFlag } from "@/lib/db/schema";

export interface DebriefInput {
  weekStart: Date;
  weekEnd: Date;
}

export interface DebriefOutput {
  narrativeText: string;
  flags: DebriefFlag[];
}

const VALID_FLAG_KINDS = new Set([
  "spending_spike",
  "spending_drop",
  "budget_overrun",
  "recurring_due",
  "income_change",
  "new_category",
]);

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function groupByCategory(
  txns: Array<{ amountNative: number; categoryId: string | null }>,
): Record<string, number> {
  const map = new Map<string, number>();
  for (const t of txns) {
    if (t.categoryId) {
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amountNative);
    }
  }
  return Object.fromEntries(map);
}

function threeMonthAvg(
  txns: Array<{ amountNative: number; categoryId: string | null }>,
): Record<string, number> {
  const totals = groupByCategory(txns);
  return Object.fromEntries(
    Object.entries(totals).map(([id, total]) => [id, Math.round(total / 12)]),
  );
}

export async function generateDebrief(
  db: Db,
  tenantId: string,
  userId: string,
  input: DebriefInput,
): Promise<DebriefOutput> {
  const client = new Anthropic();
  const { weekStart, weekEnd } = input;

  const prevStart = new Date(weekStart);
  prevStart.setUTCDate(prevStart.getUTCDate() - 7);
  const prevEnd = new Date(weekEnd);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 7);

  const threeMonthsAgo = new Date(weekStart);
  threeMonthsAgo.setUTCMonth(threeMonthsAgo.getUTCMonth() - 3);

  const [thisWeekTxns, prevWeekTxns, threeMonthTxns, budgets, subscriptions, userRow] =
    await Promise.all([
      db.query.transaction.findMany({
        where: (t, { and, between, eq }) =>
          and(eq(t.tenantId, tenantId), between(t.startedAt, weekStart, weekEnd)),
        columns: { amountNative: true, currency: true, categoryId: true },
      }),
      db.query.transaction.findMany({
        where: (t, { and, between, eq }) =>
          and(eq(t.tenantId, tenantId), between(t.startedAt, prevStart, prevEnd)),
        columns: { amountNative: true, currency: true, categoryId: true },
      }),
      db.query.transaction.findMany({
        where: (t, { and, between, eq }) =>
          and(eq(t.tenantId, tenantId), between(t.startedAt, threeMonthsAgo, weekStart)),
        columns: { amountNative: true, currency: true, categoryId: true },
      }),
      db.query.budgetTarget.findMany({
        where: (b, { eq }) => eq(b.tenantId, tenantId),
        columns: { categoryId: true, amountMonthly: true },
      }),
      db.query.recurringSubscription.findMany({
        where: (s, { and, eq, gte, lte }) =>
          and(
            eq(s.tenantId, tenantId),
            gte(s.nextDue, toDateStr(weekStart)),
            lte(s.nextDue, toDateStr(weekEnd)),
          ),
        columns: { name: true, amountNative: true, currency: true, nextDue: true },
      }),
      db.query.user.findFirst({
        where: (u, { eq }) => eq(u.id, userId),
        columns: { baseCurrency: true },
      }),
    ]);

  const baseCurrency = userRow?.baseCurrency ?? "EUR";

  const context = {
    baseCurrency,
    weekStart: toDateStr(weekStart),
    weekEnd: toDateStr(weekEnd),
    thisWeek: {
      income: thisWeekTxns
        .filter((t) => t.amountNative > 0)
        .reduce((s, t) => s + t.amountNative, 0),
      expenses: thisWeekTxns
        .filter((t) => t.amountNative < 0)
        .reduce((s, t) => s + t.amountNative, 0),
      byCategory: groupByCategory(thisWeekTxns),
    },
    prevWeek: {
      income: prevWeekTxns
        .filter((t) => t.amountNative > 0)
        .reduce((s, t) => s + t.amountNative, 0),
      expenses: prevWeekTxns
        .filter((t) => t.amountNative < 0)
        .reduce((s, t) => s + t.amountNative, 0),
      byCategory: groupByCategory(prevWeekTxns),
    },
    threeMonthAvgByCategory: threeMonthAvg(threeMonthTxns),
    budgets: budgets.map((b) => ({ categoryId: b.categoryId, amountMonthly: b.amountMonthly })),
    recurringDueSoon: subscriptions.map((s) => ({
      name: s.name,
      amount: s.amountNative,
      currency: s.currency,
      nextDue: s.nextDue,
    })),
  };

  const response = await client.messages.create({
    model: process.env.MODEL_ADVISOR ?? "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: `You are a personal finance advisor producing a concise weekly debrief. Be direct, specific, and a little blunt — like a smart friend who looked at your finances. Amounts are in minor currency units (divide by 100 for display).

Return ONLY valid JSON in this exact shape:
{
  "narrative": "2-3 sentence summary of the week",
  "flags": [
    { "kind": "spending_spike", "category": "string", "changePct": number, "message": "string" },
    { "kind": "spending_drop",  "category": "string", "changePct": number, "message": "string" },
    { "kind": "budget_overrun", "category": "string", "message": "string" },
    { "kind": "recurring_due",  "name": "string",     "message": "string" },
    { "kind": "income_change",  "changePct": number,  "message": "string" },
    { "kind": "new_category",   "category": "string", "message": "string" }
  ]
}`,
    messages: [{ role: "user", content: JSON.stringify(context) }],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  // Intentionally NOT try/caught — parse failure throws, cron route catches and returns 500
  const parsed = JSON.parse(text) as { narrative: string; flags: unknown[] };

  const validFlags = (parsed.flags ?? []).filter(
    (f): f is DebriefFlag =>
      typeof f === "object" && f !== null && VALID_FLAG_KINDS.has((f as Record<string, unknown>)["kind"] as string),
  );

  return {
    narrativeText: parsed.narrative,
    flags: validFlags,
  };
}
