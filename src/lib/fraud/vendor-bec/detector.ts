import { and, eq, lt, ne, sql } from "drizzle-orm";
import type { Detector, DetectorContext, FraudSignalDraft } from "@/lib/fraud/interface";
import { transaction, type Transaction } from "@/lib/db/schema";
import {
  addressMismatch,
  amountAnomaly,
  isNewPayee,
  normalizePayee,
  urgencyLanguageScan,
} from "./heuristics";

/**
 * Optional vendor address directory keyed by normalized payee.
 * Empty by default — populated later when we have a verified payee book.
 * Exported for tests.
 */
export const knownVendorAddresses = new Map<string, string>();

export interface VendorBecHistoryRow {
  descriptionRaw: string | null;
  amountNative: number;
  startedAt: Date;
}

/** Pure evaluation — used by the detector and by unit tests. */
export function evaluateVendorBec(
  tx: Pick<Transaction, "id" | "amountNative" | "descriptionRaw" | "startedAt">,
  historyRows: VendorBecHistoryRow[],
  addressDirectory: Map<string, string> = knownVendorAddresses,
): FraudSignalDraft | null {
  if (tx.amountNative >= 0) return null;

  const payee = normalizePayee(tx.descriptionRaw);
  if (!payee) return null;

  const tenantHistory = historyRows
    .map((r) => normalizePayee(r.descriptionRaw))
    .filter(Boolean);

  const vendorRows = historyRows.filter((r) => normalizePayee(r.descriptionRaw) === payee);
  const vendorHistory = vendorRows.map((r) => r.amountNative);

  const payeeFirstSeenAt =
    vendorRows.length === 0
      ? tx.startedAt.toISOString()
      : [...vendorRows]
          .map((r) => r.startedAt)
          .sort((a, b) => a.getTime() - b.getTime())[0]!
          .toISOString();

  const newPayee = isNewPayee(payee, tenantHistory);
  const anomaly = amountAnomaly(tx.amountNative, vendorHistory);
  const urgency = urgencyLanguageScan(tx.descriptionRaw ?? "");
  const knownAddress = addressDirectory.get(payee) ?? null;
  const addrMismatch = addressMismatch(tx.descriptionRaw ?? "", knownAddress);

  const fires = [newPayee, anomaly.flagged, urgency.flagged, addrMismatch].filter(Boolean);
  if (fires.length === 0) return null;

  const severity = fires.length >= 2 ? "high" : "warn";

  return {
    detectorId: "vendor-bec",
    transactionId: tx.id,
    severity,
    evidence: {
      payee,
      payeeFirstSeenAt: newPayee ? payeeFirstSeenAt : null,
      isNewPayee: newPayee,
      amountVsMedianRatio: anomaly.ratio,
      amountMedian: anomaly.median,
      urgencyTermsFound: urgency.matchedTerms,
      addressMismatch: addrMismatch,
    },
    suggestedAction:
      severity === "high"
        ? "Verify payee bank details out-of-band before treating this payment as legitimate."
        : "Review this outflow — one vendor-BEC heuristic matched.",
  };
}

export const vendorBecDetector: Detector = {
  id: "vendor-bec",

  async run(ctx: DetectorContext, tx: Transaction): Promise<FraudSignalDraft[]> {
    if (tx.amountNative >= 0) return [];
    const payee = normalizePayee(tx.descriptionRaw);
    if (!payee) return [];

    const historyRows = await ctx.db
      .select({
        descriptionRaw: transaction.descriptionRaw,
        amountNative: transaction.amountNative,
        startedAt: transaction.startedAt,
      })
      .from(transaction)
      .where(
        and(
          eq(transaction.tenantId, ctx.tenantId),
          ne(transaction.id, tx.id),
          lt(transaction.amountNative, 0),
          sql`${transaction.startedAt} > now() - interval '24 months'`,
        ),
      );

    const draft = evaluateVendorBec(tx, historyRows);
    return draft ? [draft] : [];
  },
};
