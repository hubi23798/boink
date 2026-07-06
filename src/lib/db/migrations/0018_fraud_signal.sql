-- TRU-C-01: fraud_signal — append-only (no delete), tenant-scoped, observer-visible.
-- Detective-only spine per spec §2.4 / §4.1. Status transitions (dismiss/ack/escalate)
-- are the only permitted mutations; rows are never deleted.

CREATE TYPE signal_severity AS ENUM ('info', 'warn', 'high');
CREATE TYPE signal_status AS ENUM ('open', 'dismissed', 'acknowledged', 'escalated');

CREATE TABLE IF NOT EXISTS "fraud_signal" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "detector_id" text NOT NULL,
  "transaction_id" uuid REFERENCES "transaction"("id") ON DELETE SET NULL,
  "severity" signal_severity NOT NULL,
  "evidence" jsonb NOT NULL,
  "suggested_action" text NOT NULL,
  "status" signal_status NOT NULL DEFAULT 'open',
  "dismissed_by" uuid REFERENCES "user"("id") ON DELETE SET NULL,
  "dismissed_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "fraud_signal_tenant_status_idx"
  ON "fraud_signal" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "fraud_signal_transaction_idx"
  ON "fraud_signal" ("transaction_id");

-- Dedup guard: at most one OPEN signal per (tenant, detector, transaction).
CREATE UNIQUE INDEX IF NOT EXISTS "fraud_signal_open_dedup_udx"
  ON "fraud_signal" ("tenant_id", "detector_id", "transaction_id")
  WHERE "status" = 'open' AND "transaction_id" IS NOT NULL;

ALTER TABLE "fraud_signal" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "fraud_signal"
  FOR ALL TO authenticated
  USING (tenant_id = (auth.jwt() ->> 'active_tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'active_tenant_id')::uuid);

-- Append-only: signals are never deleted. Observer-scope write restrictions land
-- with the observer RLS layer (TRU-BTR-03).
REVOKE DELETE ON "fraud_signal" FROM authenticated;
