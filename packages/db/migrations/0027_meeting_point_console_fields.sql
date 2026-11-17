ALTER TABLE "meeting_points" ADD COLUMN "shelter_hours" jsonb;--> statement-breakpoint
ALTER TABLE "meeting_points" ADD COLUMN "shelter_note_is" text;--> statement-breakpoint
ALTER TABLE "meeting_points" ADD COLUMN "shelter_note_en" text;--> statement-breakpoint
ALTER TABLE "meeting_points" ADD COLUMN "amenities_reviewed_on" date;--> statement-breakpoint
ALTER TABLE "meeting_points" ADD COLUMN "season_reviewed_on" date;--> statement-breakpoint
ALTER TABLE "meeting_points" ADD CONSTRAINT "meeting_points_shelter_hours_check" CHECK (case when "meeting_points"."shelter_hours" is null then true when jsonb_typeof("meeting_points"."shelter_hours") = 'array' then jsonb_array_length("meeting_points"."shelter_hours") = 7 else false end);