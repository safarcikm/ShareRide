CREATE TABLE "blocked_numbers" (
	"phone_hash" text PRIMARY KEY NOT NULL,
	"until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erased_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"erased_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_body_check";--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_key_check";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "erased_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_body_check" CHECK (case when "messages"."erased_at" is null then ("messages"."kind" = 'text') = ("messages"."body" is not null) and char_length("messages"."body") between 1 and 1000 else "messages"."body" is null end);--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_key_check" CHECK (case when "messages"."erased_at" is null then ("messages"."kind" = 'text') = ("messages"."key" is null) else "messages"."key" is null and "messages"."params" is null and "messages"."kind" <> 'system' end);