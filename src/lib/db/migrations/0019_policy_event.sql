-- TRU-C-01: policy_event — append-only advisor refusal + welfare-flag log.
-- Tenant-scoped, observer-visible (surfaced_to_observer gates owner-only welfare
-- flags). PII hygiene: trigger text is stored only as a hash, never raw (spec §4.1).

CREATE TYPE policy_event_category AS ENUM (
  'securities', 'tax_evasion', 'aml', 'insider', 'legal', 'welfare', 'scam_enablement', 'cross_tenant'
);

CREATE TABLE IF NOT EXISTS "policy_event" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "user"("id") ON DELETE SET NULL,
  "conversation_id" uuid REFERENCES "advisor_conversation"("id") ON DELETE SET NULL,
  "category" policy_event_category NOT NULL,
  "trigger_text_hash" bytea NOT NULL,
  "surfaced_to_observer" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "policy_event_tenant_created_idx"
  ON "policy_event" ("tenant_id", "created_at");

ALTER TABLE "policy_event" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "policy_event"
  FOR ALL TO authenticated
  USING (tenant_id = (auth.jwt() ->> 'active_tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'active_tenant_id')::uuid);

-- Append-only: refusal events are immutable evidence for SOC2 + product feedback.
REVOKE UPDATE, DELETE ON "policy_event" FROM authenticated;
