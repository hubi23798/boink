import type { Db } from "@/lib/db/client";
import type { FraudSignal, Transaction } from "@/lib/db/schema";

/** Fraud detector fan-out — wired in BEU-09/11; no-op until detectors ship. */
export async function runDetectors(
  _db: Db,
  _tenantId: string,
  _transactions: Transaction[],
): Promise<FraudSignal[]> {
  return [];
}
