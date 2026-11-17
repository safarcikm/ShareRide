CREATE TABLE "moderation_actions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid,
	"kind" text NOT NULL,
	"report_id" uuid,
	"rule" text,
	"reason" text NOT NULL,
	"content_kind" text,
	"content_id" uuid,
	"until" timestamp with time zone,
	"operator_id" uuid,
	"appeal_text" text,
	"appealed_at" timestamp with time zone,
	"appeal_answer" text,
	"appeal_outcome" text,
	"appeal_answered_at" timestamp with time zone,
	"appeal_answered_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_actions_kind_check" CHECK ("moderation_actions"."kind" in ('warning', 'content_hidden', 'suspension', 'reinstatement', 'trip_cancelled', 'refund')),
	CONSTRAINT "moderation_actions_rule_check" CHECK (("moderation_actions"."kind" = 'reinstatement') = ("moderation_actions"."rule" is null) and ("moderation_actions"."rule" is null or "moderation_actions"."rule" in ('safety', 'harassment', 'discrimination', 'scam', 'false_info', 'offensive', 'not_as_listed', 'reliability', 'other'))),
	CONSTRAINT "moderation_actions_content_check" CHECK (("moderation_actions"."content_kind" is null) = ("moderation_actions"."content_id" is null) and ("moderation_actions"."content_kind" is null or "moderation_actions"."content_kind" in ('message', 'review', 'trip_note', 'about', 'trip', 'booking'))),
	CONSTRAINT "moderation_actions_until_check" CHECK ("moderation_actions"."until" is null or "moderation_actions"."kind" = 'suspension'),
	CONSTRAINT "moderation_actions_appeal_check" CHECK (("moderation_actions"."appeal_text" is null) = ("moderation_actions"."appealed_at" is null) and ("moderation_actions"."appeal_answered_at" is null or "moderation_actions"."appealed_at" is not null) and ("moderation_actions"."appeal_answered_at" is null) = ("moderation_actions"."appeal_outcome" is null) and ("moderation_actions"."appeal_answered_at" is null) = ("moderation_actions"."appeal_answer" is null)),
	CONSTRAINT "moderation_actions_outcome_check" CHECK ("moderation_actions"."appeal_outcome" is null or "moderation_actions"."appeal_outcome" in ('upheld', 'reversed'))
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_check";--> statement-breakpoint
ALTER TABLE "outbox_events" DROP CONSTRAINT "outbox_events_kind_check";--> statement-breakpoint
ALTER TABLE "scheduled_notifications" DROP CONSTRAINT "scheduled_notifications_kind_check";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "moderation_action_id" uuid;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "cancelled_by" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_appeal_answered_by_id_users_id_fk" FOREIGN KEY ("appeal_answered_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moderation_actions_user_index" ON "moderation_actions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "moderation_actions_report_index" ON "moderation_actions" USING btree ("report_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_moderation_action_id_moderation_actions_id_fk" FOREIGN KEY ("moderation_action_id") REFERENCES "public"."moderation_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_moderation_action_index" ON "notifications" USING btree ("moderation_action_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" in ('request_new', 'request_halfway', 'pay_now', 'pay_reminder', 'booking_confirmed', 'booking_confirmed_driver', 'request_declined', 'request_expired', 'request_expired_driver', 'request_withdrawn', 'payment_window_ended', 'payment_window_ended_driver', 'departure_moved', 'departure_moved_far', 'trip_changed', 'trip_cancelled', 'booking_cancelled_by_driver', 'booking_cancelled_by_passenger', 'booking_cancelled_by_shareride', 'refund_issued', 'meeting_point_changed', 'meeting_point_changed_driver', 'new_message', 'unread_messages', 'reminder_evening', 'reminder_evening_driver', 'reminder_hour', 'reminder_hour_driver', 'payout_sent', 'checked_in', 'checked_in_driver', 'data_export_ready', 'moderation_action', 'suspension_ended', 'report_filed', 'report_filed_urgent'));--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_kind_check" CHECK ("outbox_events"."kind" in ('BookingRequested', 'BookingAccepted', 'BookingConfirmed', 'BookingDeclined', 'BookingExpired', 'BookingWithdrawn', 'BookingCancelled', 'DepartureMoved', 'TripChanged', 'TripCancelled', 'RefundIssued', 'MessageSent', 'CheckedIn', 'DataExportReady', 'ReportFiled', 'ModerationActionTaken', 'SuspensionEnded'));--> statement-breakpoint
ALTER TABLE "scheduled_notifications" ADD CONSTRAINT "scheduled_notifications_kind_check" CHECK ("scheduled_notifications"."kind" in ('request_new', 'request_halfway', 'pay_now', 'pay_reminder', 'booking_confirmed', 'booking_confirmed_driver', 'request_declined', 'request_expired', 'request_expired_driver', 'request_withdrawn', 'payment_window_ended', 'payment_window_ended_driver', 'departure_moved', 'departure_moved_far', 'trip_changed', 'trip_cancelled', 'booking_cancelled_by_driver', 'booking_cancelled_by_passenger', 'booking_cancelled_by_shareride', 'refund_issued', 'meeting_point_changed', 'meeting_point_changed_driver', 'new_message', 'unread_messages', 'reminder_evening', 'reminder_evening_driver', 'reminder_hour', 'reminder_hour_driver', 'payout_sent', 'checked_in', 'checked_in_driver', 'data_export_ready', 'moderation_action', 'suspension_ended', 'report_filed', 'report_filed_urgent'));--> statement-breakpoint
-- Every trip cancelled before this was cancelled by its driver.
UPDATE "trips" SET "cancelled_by" = 'driver' WHERE "cancelled_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_cancelled_by_check" CHECK (("trips"."cancelled_by" is null) = ("trips"."cancelled_at" is null) and ("trips"."cancelled_by" is null or "trips"."cancelled_by" in ('driver', 'operator')));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_suspended_until_check" CHECK ("users"."suspended_until" is null or "users"."status" = 'suspended');