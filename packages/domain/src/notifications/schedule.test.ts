import { describe, expect, it } from "vitest";
import { payReminderAt, reminderTimes, requestHalfwayAt, unreadSummaryAt } from "./schedule.ts";
import { defaultNotificationSettings } from "./settings.ts";

const settings = defaultNotificationSettings;
const at = (iso: string) => new Date(iso);
const iso = (moment: Date | null) => moment?.toISOString() ?? null;
const times = (startsAt: string, since: string) =>
  reminderTimes({ startsAt: at(startsAt), since: at(since) }, settings).map((reminder) => [
    reminder.which,
    iso(reminder.at),
  ]);

describe("reminders (spec 7, 3.5)", () => {
  it("come at 18:00 the evening before and an hour before", () => {
    expect(times("2026-11-20T08:00:00Z", "2026-11-15T12:00:00Z")).toEqual([
      ["evening", "2026-11-19T18:00:00.000Z"],
      ["hour", "2026-11-20T07:00:00.000Z"],
    ]);
  });

  it("keep the evening one for a booking confirmed at 17:59 the day before", () => {
    expect(times("2026-11-20T08:00:00Z", "2026-11-19T17:59:00Z")).toEqual([
      ["evening", "2026-11-19T18:00:00.000Z"],
      ["hour", "2026-11-20T07:00:00.000Z"],
    ]);
  });

  it("skip the evening one for a booking confirmed at 18:01 the day before", () => {
    expect(times("2026-11-20T08:00:00Z", "2026-11-19T18:01:00Z")).toEqual([
      ["hour", "2026-11-20T07:00:00.000Z"],
    ]);
  });

  it("keep the hour one for a booking confirmed 61 minutes before, and skip it at 59", () => {
    expect(times("2026-11-20T08:00:00Z", "2026-11-20T06:59:00Z")).toEqual([
      ["hour", "2026-11-20T07:00:00.000Z"],
    ]);
    expect(times("2026-11-20T08:00:00Z", "2026-11-20T07:01:00Z")).toEqual([]);
  });

  it("send the evening one on the day before for a departure just after midnight", () => {
    expect(times("2026-11-20T00:30:00Z", "2026-11-15T12:00:00Z")).toEqual([
      ["evening", "2026-11-19T18:00:00.000Z"],
      ["hour", "2026-11-19T23:30:00.000Z"],
    ]);
  });

  it("keep one due exactly at the moment they are worked out", () => {
    expect(times("2026-11-20T08:00:00Z", "2026-11-20T07:00:00Z")).toEqual([
      ["hour", "2026-11-20T07:00:00.000Z"],
    ]);
  });

  it("are worked out again from now after a departure move, so none comes twice", () => {
    // Moved at 20:00 the evening before, from 08:00 to 10:00: the evening one was sent.
    expect(times("2026-11-20T10:00:00Z", "2026-11-19T20:00:00Z")).toEqual([
      ["hour", "2026-11-20T09:00:00.000Z"],
    ]);
  });

  it("go back over the end of a month and a year", () => {
    expect(times("2026-12-01T08:00:00Z", "2026-11-15T12:00:00Z")[0]).toEqual([
      "evening",
      "2026-11-30T18:00:00.000Z",
    ]);
    expect(times("2027-01-01T10:00:00Z", "2026-12-15T12:00:00Z")[0]).toEqual([
      "evening",
      "2026-12-31T18:00:00.000Z",
    ]);
  });
});

describe("the driver's halfway reminder for a request (spec 7, 3.3)", () => {
  it("comes halfway between the request and its deadline", () => {
    expect(
      iso(
        requestHalfwayAt({
          requestedAt: at("2026-11-15T08:00:00Z"),
          expiresAt: at("2026-11-15T20:00:00Z"),
        }),
      ),
    ).toBe("2026-11-15T14:00:00.000Z");
  });
});

describe("the passenger's reminder to pay (spec 7, 3.3)", () => {
  it("comes 10 minutes before the payment deadline", () => {
    expect(
      iso(
        payReminderAt(
          { acceptedAt: at("2026-11-15T10:00:00Z"), dueAt: at("2026-11-15T10:30:00Z") },
          settings,
        ),
      ),
    ).toBe("2026-11-15T10:20:00.000Z");
  });

  it("is skipped when the window is 10 minutes or shorter", () => {
    expect(
      payReminderAt(
        { acceptedAt: at("2026-11-15T10:00:00Z"), dueAt: at("2026-11-15T10:10:00Z") },
        settings,
      ),
    ).toBeNull();
  });
});

describe("the unread messages email (spec 7, 3.6, item 3)", () => {
  const sentAt = at("2026-11-15T10:00:00Z");

  it("comes 15 minutes after the message", () => {
    expect(iso(unreadSummaryAt({ sentAt, lastSummaryAt: null }, settings))).toBe(
      "2026-11-15T10:15:00.000Z",
    );
    expect(
      iso(unreadSummaryAt({ sentAt, lastSummaryAt: at("2026-11-15T08:00:00Z") }, settings)),
    ).toBe("2026-11-15T10:15:00.000Z");
  });

  it("waits an hour after the last one about the same conversation", () => {
    expect(
      iso(unreadSummaryAt({ sentAt, lastSummaryAt: at("2026-11-15T09:50:00Z") }, settings)),
    ).toBe("2026-11-15T10:50:00.000Z");
  });
});
