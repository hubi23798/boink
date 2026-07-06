-- Phase B-EU: aggregator connection linkage (TRU-BEU-01)

CREATE TYPE "public"."provider_enum" AS ENUM('truelayer', 'tink', 'plaid', 'manual', 'csv');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('active', 'error', 'revoked', 'paused');--> statement-breakpoint
CREATE TABLE "connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" "provider_enum" NOT NULL,
	"provider_item_id" text NOT NULL,
	"access_token_ref" text NOT NULL,
	"status" "connection_status" DEFAULT 'active' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connection_tenant_idx" ON "connection" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connection_tenant_provider_item_udx" ON "connection" USING btree ("tenant_id", "provider", "provider_item_id");--> statement-breakpoint
ALTER TABLE "connection" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "connection_tenant_isolation" ON "connection" AS PERMISSIVE FOR ALL TO "authenticated" USING (tenant_id = (auth.jwt() ->> 'active_tenant_id')::uuid) WITH CHECK (tenant_id = (auth.jwt() ->> 'active_tenant_id')::uuid);
