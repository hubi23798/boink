import { and, eq, inArray } from "drizzle-orm";
import { appendAudit } from "@/lib/audit/append";
import type { Db } from "@/lib/db/client";
import { fraudSignal, type Transaction } from "@/lib/db/schema";
import type { Detector, DetectorContext, FraudSignalDraft } from "./interface";
import { registeredDetectors } from "./registry";

/** Stable dedup key: at most one OPEN signal per (detector, transaction). */
export function signalKey(detectorId: string, transactionId: string | null): string {
  return `${detectorId}::${transactionId ?? ""}`;
}

/**
 * Run every detector over every transaction and collect all drafts. Detector
 * failures are isolated: one detector throwing logs and is skipped, never
 * aborting the batch (detective-only — detection must never block ingest).
 */
export async function fanOut(
  detectors: Detector[],
  ctx: DetectorContext,
  transactions: Transaction[],
): Promise<FraudSignalDraft[]> {
  const drafts: FraudSignalDraft[] = [];
  for (const tx of transactions) {
    for (const detector of detectors) {
      try {
        drafts.push(...(await detector.run(ctx, tx)));
      } catch (e) {
        console.error(`[fraud] detector ${detector.id} failed on tx ${tx.id}:`, e);
      }
    }
  }
  return drafts;
}

/**
 * Drop drafts whose (detector, transaction) already has an open signal, and
 * collapse duplicate drafts within this batch.
 */
export function selectNewDrafts(
  drafts: FraudSignalDraft[],
  existingKeys: ReadonlySet<string>,
): FraudSignalDraft[] {
  const seen = new Set(existingKeys);
  const out: FraudSignalDraft[] = [];
  for (const d of drafts) {
    const key = signalKey(d.detectorId, d.transactionId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

export interface RunDetectorsResult {
  written: number;
  skipped: number;
}

/**
 * Fan out the registered detectors over `transactions`, dedupe against existing
 * open signals, persist the fresh ones, and audit each write. Idempotent: a
 * second run over the same transactions writes nothing.
 */
export async function runDetectors(
  db: Db,
  tenantId: string,
  transactions: Transaction[],
  detectors: Detector[] = registeredDetectors,
): Promise<RunDetectorsResult> {
  if (detectors.length === 0 || transactions.length === 0) {
    return { written: 0, skipped: 0 };
  }

  const drafts = await fanOut(detectors, { db, tenantId }, transactions);
  if (drafts.length === 0) return { written: 0, skipped: 0 };

  const txIds = [
    ...new Set(drafts.map((d) => d.transactionId).filter((x): x is string => x !== null)),
  ];
  const existing = txIds.length
    ? await db
        .select({
          detectorId: fraudSignal.detectorId,
          transactionId: fraudSignal.transactionId,
        })
        .from(fraudSignal)
        .where(
          and(
            eq(fraudSignal.tenantId, tenantId),
            eq(fraudSignal.status, "open"),
            inArray(fraudSignal.transactionId, txIds),
          ),
        )
    : [];
  const existingKeys = new Set(existing.map((r) => signalKey(r.detectorId, r.transactionId)));

  const fresh = selectNewDrafts(drafts, existingKeys);
  if (fresh.length === 0) return { written: 0, skipped: drafts.length };

  let written = 0;
  for (const d of fresh) {
    const [row] = await db
      .insert(fraudSignal)
      .values({
        tenantId,
        detectorId: d.detectorId,
        transactionId: d.transactionId,
        severity: d.severity,
        evidence: d.evidence,
        suggestedAction: d.suggestedAction,
        expiresAt: d.expiresAt ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: fraudSignal.id });
    // Race with the partial-unique dedup index: another writer won, skip.
    if (!row) continue;
    written += 1;
    await appendAudit(db, {
      tenantId,
      actorUserId: null,
      action: "fraud_signal.create",
      targetType: "fraud_signal",
      targetId: row.id,
      after: {
        detectorId: d.detectorId,
        severity: d.severity,
        transactionId: d.transactionId,
      },
      context: { source: "detector" },
    });
  }

  return { written, skipped: drafts.length - written };
}
