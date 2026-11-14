CREATE TABLE "legs" (
	"from_meeting_point_id" uuid NOT NULL,
	"to_meeting_point_id" uuid NOT NULL,
	"distance_m" integer NOT NULL,
	"duration_s" integer NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "legs_from_meeting_point_id_to_meeting_point_id_pk" PRIMARY KEY("from_meeting_point_id","to_meeting_point_id"),
	CONSTRAINT "legs_not_to_itself_check" CHECK ("legs"."from_meeting_point_id" <> "legs"."to_meeting_point_id"),
	CONSTRAINT "legs_positive_check" CHECK ("legs"."distance_m" > 0 and "legs"."duration_s" > 0)
);
--> statement-breakpoint
CREATE TABLE "meeting_points" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name_is" text NOT NULL,
	"name_en" text,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"location" geography(Point, 4326) NOT NULL,
	"region" text NOT NULL,
	"municipality" text NOT NULL,
	"type" text NOT NULL,
	"amenities" text[] DEFAULT '{}' NOT NULL,
	"where_to_stand_is" text,
	"where_to_stand_en" text,
	"season_start_month" smallint,
	"season_end_month" smallint,
	"status" text DEFAULT 'draft' NOT NULL,
	"pause_reason_is" text,
	"pause_reason_en" text,
	"paused_until" date,
	"last_checked_on" date,
	"review_due_on" date,
	"sample" boolean DEFAULT false NOT NULL,
	"search_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_points_region_check" CHECK ("meeting_points"."region" in ('capital', 'southern-peninsula', 'west', 'westfjords', 'northwest', 'northeast', 'east', 'south')),
	CONSTRAINT "meeting_points_type_check" CHECK ("meeting_points"."type" in ('fuel-station', 'bus-hub', 'shopping-centre', 'airport', 'ferry-terminal', 'parking', 'other')),
	CONSTRAINT "meeting_points_status_check" CHECK ("meeting_points"."status" in ('draft', 'active', 'paused', 'retiring', 'retired')),
	CONSTRAINT "meeting_points_amenities_check" CHECK ("meeting_points"."amenities" <@ array['shelter', 'toilets', 'shop', 'parking', 'step-free']::text[]),
	CONSTRAINT "meeting_points_season_check" CHECK (("meeting_points"."season_start_month" is null and "meeting_points"."season_end_month" is null) or ("meeting_points"."season_start_month" between 1 and 12 and "meeting_points"."season_end_month" between 1 and 12))
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name_is" text NOT NULL,
	"name_en" text,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"location" geography(Point, 4326) NOT NULL,
	"kind" text NOT NULL,
	"region" text NOT NULL,
	"match_radius_m" integer NOT NULL,
	"municipalities" text[] DEFAULT '{}' NOT NULL,
	"sample" boolean DEFAULT false NOT NULL,
	"search_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "places_kind_check" CHECK ("places"."kind" in ('area', 'town', 'village', 'landmark')),
	CONSTRAINT "places_region_check" CHECK ("places"."region" in ('capital', 'southern-peninsula', 'west', 'westfjords', 'northwest', 'northeast', 'east', 'south')),
	CONSTRAINT "places_match_radius_check" CHECK ("places"."match_radius_m" > 0)
);
--> statement-breakpoint
ALTER TABLE "legs" ADD CONSTRAINT "legs_from_meeting_point_id_meeting_points_id_fk" FOREIGN KEY ("from_meeting_point_id") REFERENCES "public"."meeting_points"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legs" ADD CONSTRAINT "legs_to_meeting_point_id_meeting_points_id_fk" FOREIGN KEY ("to_meeting_point_id") REFERENCES "public"."meeting_points"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legs_to_index" ON "legs" USING btree ("to_meeting_point_id");--> statement-breakpoint
CREATE INDEX "meeting_points_location_index" ON "meeting_points" USING gist ("location");--> statement-breakpoint
CREATE INDEX "meeting_points_search_text_index" ON "meeting_points" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "places_search_text_index" ON "places" USING gin ("search_text" gin_trgm_ops);