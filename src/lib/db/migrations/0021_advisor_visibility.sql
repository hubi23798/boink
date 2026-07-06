-- Phase B-EU: observer-visible advisor conversations (TRU-BEU-01)

CREATE TYPE "public"."advisor_visibility" AS ENUM('owner_private', 'observers_visible');--> statement-breakpoint
ALTER TABLE "advisor_conversation" ADD COLUMN "visibility" "advisor_visibility" DEFAULT 'owner_private' NOT NULL;
