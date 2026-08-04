-- TRU-BEU-08/11: strengthen fraud_signal for detector runner
-- - partial unique index for open-signal dedup
-- - transaction lookup index
-- - REVOKE DELETE (append-only; status transitions only)

CREATE INDEX IF NOT EXISTS "fraud_signal_transaction_idx"
  ON "fraud_signal" ("transaction_id");--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "fraud_signal_open_dedup_udx"
  ON "fraud_signal" ("tenant_id", "detector_id", "transaction_id")
  WHERE "status" = 'open' AND "transaction_id" IS NOT NULL;--> statement-breakpoint

-- Append-only: signals are never deleted. Observer-scope write restrictions land
-- with the observer RLS layer (TRU-BTR-03). Guarded for plain-Postgres CI.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE DELETE ON "fraud_signal" FROM authenticated';
  END IF;
END $$;
