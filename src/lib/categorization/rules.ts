import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  categorizationRule,
  transaction,
  type CategorizationRule,
  type Transaction,
} from "@/lib/db/schema";

export function matches(rule: CategorizationRule, txn: Transaction): boolean {
  switch (rule.matchKind) {
    case "description_contains":
      return (txn.descriptionRaw ?? "").toLowerCase().includes(rule.matchValue.toLowerCase());

    case "description_regex":
      try {
        return new RegExp(rule.matchValue, "i").test(txn.descriptionRaw ?? "");
      } catch {
        return false;
      }

    case "type_raw_equals":
      return (txn.typeRaw ?? "").toLowerCase() === rule.matchValue.toLowerCase();

    case "amount_range": {
      let range: { min?: number; max?: number };
      try {
        range = JSON.parse(rule.matchValue) as { min?: number; max?: number };
      } catch {
        return false;
      }
      const amt = txn.amountNative;
      if (range.min !== undefined && amt < range.min) return false;
      if (range.max !== undefined && amt > range.max) return false;
      return true;
    }

    case "account_id_equals":
      return txn.accountId === rule.matchValue;

    default:
      return false;
  }
}

export async function applyRules(
  db: Db,
  tenantId: string,
  transactionIds: string[],
): Promise<number> {
  if (transactionIds.length === 0) return 0;

  const rules = await db.query.categorizationRule.findMany({
    where: eq(categorizationRule.tenantId, tenantId),
    orderBy: [asc(categorizationRule.priority)],
  });

  if (rules.length === 0) return 0;

  const txns = await db.query.transaction.findMany({
    where: and(inArray(transaction.id, transactionIds), isNull(transaction.categoryId)),
  });

  let matched = 0;

  for (const txn of txns) {
    for (const rule of rules) {
      if (matches(rule, txn)) {
        await db
          .update(transaction)
          .set({
            categoryId: rule.categoryId,
            categorizedBy: "rule",
            categorizationRuleId: rule.id,
          })
          .where(eq(transaction.id, txn.id));

        await db
          .update(categorizationRule)
          .set({ matchCount: rule.matchCount + 1, lastMatchedAt: new Date() })
          .where(eq(categorizationRule.id, rule.id));

        matched++;
        break; // first match wins
      }
    }
  }

  return matched;
}
