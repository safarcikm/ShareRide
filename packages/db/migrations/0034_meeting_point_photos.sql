CREATE TABLE "meeting_point_photos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"meeting_point_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"description_is" text NOT NULL,
	"description_en" text NOT NULL,
	"position" smallint NOT NULL,
	"width" smallint NOT NULL,
	"height" smallint NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_point_photos_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "meeting_point_photos_size_check" CHECK ("meeting_point_photos"."width" > 0 and "meeting_point_photos"."height" > 0 and "meeting_point_photos"."bytes" > 0),
	CONSTRAINT "meeting_point_photos_position_check" CHECK ("meeting_point_photos"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "meeting_point_photos" ADD CONSTRAINT "meeting_point_photos_meeting_point_id_meeting_points_id_fk" FOREIGN KEY ("meeting_point_id") REFERENCES "public"."meeting_points"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_point_photos_point_index" ON "meeting_point_photos" USING btree ("meeting_point_id","position");