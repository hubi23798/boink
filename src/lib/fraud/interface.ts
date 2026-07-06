import type { Db } from "@/lib/db/client";
import type { Transaction } from "@/lib/db/schema";

/** Signal severity, mirrors the `signal_severity` DB enum. */
export type SignalSeverity = "info" | "warn" | "high";

/**
 * What a detector emits. Persisted into `fraud_signal` by the runner — detectors
 * never write to the DB themselves (single write path, single audit entry).
 *
 * `evidence` is structured data only — concrete provenance (addresses, amounts,
 * dates, feed sources), never free text from an LLM (spec §3.5).
 */
export interface FraudSignalDraft {
  detectorId: string;
  transactionId: string | null;
  severity: SignalSeverity;
  evidence: Record<string, unknown>;
  suggestedAction: string;
  expiresAt?: Date;
}

/** Ambient context handed to every detector run. */
export interface DetectorContext {
  db: Db;
  tenantId: string;
}

/**
 * A pluggable detector. Detective-only: it inspects a transaction and returns
 * zero or more signal drafts. It must never mutate state and never block — a
 * throwing detector is isolated by the runner and never aborts ingest.
 */
export interface Detector {
  readonly id: string;
  run(ctx: DetectorContext, tx: Transaction): Promise<FraudSignalDraft[]>;
}
