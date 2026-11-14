CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_id" uuid NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"colour" text NOT NULL,
	"registration" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_make_check" CHECK (char_length(btrim("vehicles"."make")) between 1 and 40),
	CONSTRAINT "vehicles_model_check" CHECK (char_length(btrim("vehicles"."model")) between 1 and 40),
	CONSTRAINT "vehicles_colour_check" CHECK ("vehicles"."colour" in ('white', 'black', 'grey', 'silver', 'blue', 'red', 'green', 'yellow', 'brown', 'beige', 'orange', 'other')),
	CONSTRAINT "vehicles_registration_check" CHECK ("vehicles"."registration" is null or (char_length("vehicles"."registration") between 2 and 8 and "vehicles"."registration" = upper("vehicles"."registration") and "vehicles"."registration" !~ '[[:space:]-]'))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "licence_declared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vehicles_owner_index" ON "vehicles" USING btree ("owner_id");