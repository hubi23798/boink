import { and, eq, lt, sql } from "drizzle-orm";
import type { Detector, DetectorContext, FraudSignalDraft } from "@/lib/fraud/interface";
import { transaction, type Transaction } from "@/lib/db/schema";
import { normalizePayee } from "@/lib/fraud/vendor-bec/heuristics";
import {
  doubleBilling,
  postTrialConversion,
  priceHikeDetect,
  type RecurringEntry,
} from "./heuristics";

export interface SubscriptionHistoryRow {
  id: string;
  accountId: string;
  amountNative: number;
  startedAt: Date;
  descriptionRaw: string | null;
}

/** Pure evaluation — used by the detector and by unit tests. */
export function evaluateSubscriptionTrap(
  tx: Pick<Transaction, "id" | "accountId" | "amountNative" | "descriptionRaw" | "startedAt">,
  sameMerchantRows: SubscriptionHistoryRow[],
): FraudSignalDraft | null {
  if (tx.amountNative >= 0) return null;

  const payee = normalizePayee(tx.descriptionRaw);
  if (!payee) return null;

  const history: RecurringEntry[] = sameMerchantRows.map((r) => ({
    amountNative: r.amountNative,
    startedAt: r.startedAt,
    accountId: r.accountId,
    transactionId: r.id,
  }));
  if (!history.some((h) => h.transactionId === tx.id)) {
    history.push({
      amountNative: tx.amountNative,
      startedAt: tx.startedAt,
      accountId: tx.accountId,
      transactionId: tx.id,
    });
  }

  const priceHike = priceHikeDetect(history);
  const postTrial = postTrialConversion(history);
  const dbl = doubleBilling(
    {
      id: tx.id,
      accountId: tx.accountId,
      amountNative: tx.amountNative,
      startedAt: tx.startedAt,
    },
    sameMerchantRows
      .filter((r) => r.id !== tx.id)
      .map((r) => ({
        id: r.id,
        accountId: r.accountId,
        amountNative: r.amountNative,
        startedAt: r.startedAt,
      })),
  );

  const fires = [priceHike.flagged, postTrial.flagged, dbl.flagged].filter(Boolean);
  if (fires.length === 0) return null;

  const elevated =
    postTrial.flagged ||
    (priceHike.flagged && (priceHike.percentIncrease ?? 0) >= 50) ||
    (dbl.flagged && (priceHike.flagged || postTrial.flagged));

  const severity = elevated ? "high" : "warn";

  return {
    detectorId: "subscription-trap",
    transactionId: tx.id,
    severity,
    evidence: {
      payee,
      priceHike: priceHike.flagged
        ? {
            from: priceHike.from,
            to: priceHike.to,
            percentIncrease: priceHike.percentIncrease,
          }
        : null,
      postTrial: postTrial.flagged
        ? {
            trialAmount: postTrial.trialAmount,
            firstFullAmount: postTrial.firstFullAmount,
            gapDays: postTrial.gapDays,
          }
        : null,
      doubleBilling: dbl.flagged
        ? {
            txAId: dbl.txAId,
            txBId: dbl.txBId,
            accountA: dbl.accountA,
            accountB: dbl.accountB,
          }
        : null,
    },
    suggestedAction: elevated
      ? "Confirm this subscription price change or duplicate charge with the merchant."
      : "Review this recurring charge — a subscription-trap heuristic matched.",
  };
}

export const subscriptionTrapDetector: Detector = {
  id: "subscription-trap",

  async run(ctx: DetectorContext, tx: Transaction): Promise<FraudSignalDraft[]> {
    if (tx.amountNative >= 0) return [];
    const payee = normalizePayee(tx.descriptionRaw);
    if (!payee) return [];

    const rows = await ctx.db
      .select({
        id: transaction.id,
        accountId: transaction.accountId,
        amountNative: transaction.amountNative,
        startedAt: transaction.startedAt,
        descriptionRaw: transaction.descriptionRaw,
      })
      .from(transaction)
      .where(
        and(
          eq(transaction.tenantId, ctx.tenantId),
          lt(transaction.amountNative, 0),
          sql`${transaction.startedAt} > now() - interval '12 months'`,
        ),
      );

    const sameMerchant = rows.filter((r) => normalizePayee(r.descriptionRaw) === payee);
    const draft = evaluateSubscriptionTrap(tx, sameMerchant);
    return draft ? [draft] : [];
  },
};
