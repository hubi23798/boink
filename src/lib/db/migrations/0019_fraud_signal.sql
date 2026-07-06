-- Phase B-EU: fraud signals (TRU-BEU-01)

CREATE TYPE "public"."signal_severity" AS ENUM('info', 'warn', 'high');--> statement-breakpoint
CREATE TYPE "public"."signal_status" AS ENUM('open', 'dismissed', 'acknowledged', 'escalated');--> statement-breakpoint
CREATE TABLE "fraud_signal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"detector_id" text NOT NULL,
	"transaction_id" uuid,
	"severity" "signal_severity" NOT NULL,
	"evidence" jsonb NOT NULL,
	"suggested_action" text NOT NULL,
	"status" "signal_status" DEFAULT 'open' NOT NULL,
	"dismissed_by" uuid,
	"dismissed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);--> statement-breakpoint
ALTER TABLE "fraud_signal" ADD CONSTRAINT "fraud_signal_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_signal" ADD CONSTRAINT "fraud_signal_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_signal" ADD CONSTRAINT "fraud_signal_dismissed_by_user_id_fk" FOREIGN KEY ("dismissed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fraud_signal_tenant_status_idx" ON "fraud_signal" USING btree ("tenant_id", "status");--> statement-breakpoint
ALTER TABLE "fraud_signal" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "fraud_signal_tenant_isolation" ON "fraud_signal" AS PERMISSIVE FOR ALL TO "authenticated" USING (tenant_id = (auth.jwt() ->> 'active_tenant_id')::uuid) WITH CHECK (tenant_id = (auth.jwt() ->> 'active_tenant_id')::uuid);
