-- Phase B-EU: advisor policy refusals (TRU-BEU-01)

CREATE TYPE "public"."policy_category" AS ENUM(
	'securities',
	'tax_evasion',
	'aml',
	'insider',
	'legal',
	'welfare',
	'scam_enablement',
	'cross_tenant'
);--> statement-breakpoint
CREATE TABLE "policy_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid,
	"category" "policy_category" NOT NULL,
	"trigger_text_hash" bytea NOT NULL,
	"surfaced_to_observer" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "policy_event" ADD CONSTRAINT "policy_event_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_event" ADD CONSTRAINT "policy_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_event" ADD CONSTRAINT "policy_event_conversation_id_advisor_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."advisor_conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "policy_event_tenant_created_idx" ON "policy_event" USING btree ("tenant_id", "created_at");--> statement-breakpoint
ALTER TABLE "policy_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "policy_event_tenant_isolation" ON "policy_event" AS PERMISSIVE FOR ALL TO "authenticated" USING (tenant_id = (auth.jwt() ->> 'active_tenant_id')::uuid) WITH CHECK (tenant_id = (auth.jwt() ->> 'active_tenant_id')::uuid);
