CREATE TABLE "photo_files_to_delete" (
	"key" text PRIMARY KEY NOT NULL,
	"delete_after" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "photo_key" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "photo_hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_photo_key_unique" UNIQUE("photo_key");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_photo_hidden_at_check" CHECK ("users"."photo_hidden_at" is null or "users"."photo_key" is not null);