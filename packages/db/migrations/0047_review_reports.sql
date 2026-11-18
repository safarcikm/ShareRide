ALTER TABLE "reports" ADD COLUMN "review_id" uuid;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_review_index" ON "reports" USING btree ("review_id");