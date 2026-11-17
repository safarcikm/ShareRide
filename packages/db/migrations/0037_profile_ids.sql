ALTER TABLE "users" ADD COLUMN "profile_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_profile_id_unique" UNIQUE("profile_id");