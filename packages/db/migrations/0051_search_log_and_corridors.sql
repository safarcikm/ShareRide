CREATE TABLE "corridors" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"place_ids" uuid[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "corridors_name_check" CHECK (char_length("corridors"."name") between 1 and 80),
	CONSTRAINT "corridors_places_check" CHECK (cardinality("corridors"."place_ids") between 2 and 12)
);
--> statement-breakpoint
CREATE TABLE "search_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_kind" text NOT NULL,
	"from_id" uuid NOT NULL,
	"to_kind" text NOT NULL,
	"to_id" uuid NOT NULL,
	"searched_date" date,
	"results" integer NOT NULL,
	"platform" text NOT NULL,
	"searched_hour" timestamp with time zone NOT NULL,
	CONSTRAINT "search_log_from_kind_check" CHECK ("search_log"."from_kind" in ('place', 'meeting_point')),
	CONSTRAINT "search_log_to_kind_check" CHECK ("search_log"."to_kind" in ('place', 'meeting_point')),
	CONSTRAINT "search_log_platform_check" CHECK ("search_log"."platform" in ('ios', 'android', 'web', 'unknown')),
	CONSTRAINT "search_log_results_check" CHECK ("search_log"."results" >= 0),
	CONSTRAINT "search_log_hour_check" CHECK ("search_log"."searched_hour" = date_trunc('hour', "search_log"."searched_hour", 'UTC'))
);
--> statement-breakpoint
CREATE INDEX "search_log_hour_index" ON "search_log" USING btree ("searched_hour");