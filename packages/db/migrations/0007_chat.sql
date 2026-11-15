CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"booking_id" uuid NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_booking_unique" UNIQUE("booking_id"),
	CONSTRAINT "conversations_window_check" CHECK ("conversations"."opened_at" < "conversations"."closes_at")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid,
	"kind" text NOT NULL,
	"body" text,
	"key" text,
	"params" jsonb,
	"client_id" uuid,
	"sent_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_client_unique" UNIQUE("sender_id","client_id","conversation_id"),
	CONSTRAINT "messages_kind_check" CHECK ("messages"."kind" in ('text', 'quick', 'system')),
	CONSTRAINT "messages_body_check" CHECK (("messages"."kind" = 'text') = ("messages"."body" is not null) and char_length("messages"."body") between 1 and 1000),
	CONSTRAINT "messages_key_check" CHECK (("messages"."kind" = 'text') = ("messages"."key" is null)),
	CONSTRAINT "messages_sender_check" CHECK (("messages"."kind" = 'system') = ("messages"."sender_id" is null) and ("messages"."kind" = 'system') = ("messages"."client_id" is null)),
	CONSTRAINT "messages_read_check" CHECK ("messages"."kind" <> 'system' or "messages"."read_at" is null)
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_conversation_index" ON "messages" USING btree ("conversation_id","sent_at","id");--> statement-breakpoint
CREATE INDEX "messages_sender_index" ON "messages" USING btree ("sender_id","sent_at");--> statement-breakpoint
-- Bookings confirmed before chat came get their conversation, as if opened
-- when they were confirmed; it closes 7 days after the trip's planned arrival
-- (defaultChatSettings.closeAfterDays), as the API opens one.
INSERT INTO "conversations" ("booking_id", "opened_at", "closes_at")
SELECT "bookings"."id", coalesce("bookings"."confirmed_at", "bookings"."updated_at"), "trips"."arrives_at" + interval '7 days'
FROM "bookings" INNER JOIN "trips" ON "trips"."id" = "bookings"."trip_id"
WHERE "bookings"."status" = 'confirmed' AND "trips"."arrives_at" IS NOT NULL
	AND coalesce("bookings"."confirmed_at", "bookings"."updated_at") < "trips"."arrives_at" + interval '7 days'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "messages" ("conversation_id", "kind", "key", "sent_at")
SELECT "conversations"."id", 'system', 'opened', "conversations"."opened_at"
FROM "conversations"
WHERE NOT EXISTS (SELECT 1 FROM "messages" WHERE "messages"."conversation_id" = "conversations"."id");
