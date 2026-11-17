import { describe, expect, it } from "vitest";
import { bookingStatuses } from "../bookings/lifecycle.ts";
import {
  bookingProblemReportable,
  checkReport,
  holdsPayout,
  isUrgent,
  queueOrder,
  reportCategories,
  reportLimitReached,
  reportsClosedBy,
  responseDueAt,
  type ReportContext,
} from "./reports.ts";
import { defaultSafetySettings } from "./settings.ts";

const settings = defaultSafetySettings;
const now = new Date("2026-11-20T12:00:00Z");
const hours = (n: number) => n * 3_600_000;
const draft = { category: "harassment", description: "" } as const;

const check = (reporterId: string, context: ReportContext, description = "", at = now) =>
  checkReport(reporterId, context, { ...draft, description }, at, settings);

describe("what can be reported, and by whom (3.1.1, R9.1)", () => {
  it("names the person reported for each kind of subject", () => {
    expect(check("jon", { kind: "user", userId: "anna" })).toMatchObject({
      ok: true,
      value: { subjectUserId: "anna" },
    });
    expect(check("jon", { kind: "trip", driverId: "anna" })).toMatchObject({
      ok: true,
      value: { subjectUserId: "anna" },
    });
    expect(
      check("jon", { kind: "message", senderId: "anna", memberIds: ["anna", "jon"] }),
    ).toMatchObject({ ok: true, value: { subjectUserId: "anna" } });
    expect(check("jon", { kind: "review", authorId: "anna" })).toMatchObject({
      ok: true,
      value: { subjectUserId: "anna" },
    });
  });

  it("names the other side of a booking problem, from either side", () => {
    const booking = {
      kind: "booking",
      passengerId: "jon",
      driverId: "anna",
      bookingStatus: "confirmed",
      tripCompletedAt: null,
    } as const;
    expect(check("jon", booking)).toMatchObject({ ok: true, value: { subjectUserId: "anna" } });
    expect(check("anna", booking)).toMatchObject({ ok: true, value: { subjectUserId: "jon" } });
  });

  it("refuses reporting yourself, your own trip, message or review", () => {
    const own = { ok: false, error: { code: "own" } };
    expect(check("jon", { kind: "user", userId: "jon" })).toEqual(own);
    expect(check("jon", { kind: "trip", driverId: "jon" })).toEqual(own);
    expect(check("jon", { kind: "message", senderId: "jon", memberIds: ["anna", "jon"] })).toEqual(
      own,
    );
    expect(check("jon", { kind: "review", authorId: "jon" })).toEqual(own);
  });

  it("lets only the conversation's members report a message, and only a person's message", () => {
    expect(
      check("sigga", { kind: "message", senderId: "anna", memberIds: ["anna", "jon"] }),
    ).toEqual({ ok: false, error: { code: "not_involved" } });
    expect(check("jon", { kind: "message", senderId: null, memberIds: ["anna", "jon"] })).toEqual({
      ok: false,
      error: { code: "not_reportable" },
    });
  });

  it("lets only the booking's passenger or driver report a problem with it", () => {
    expect(
      check("sigga", {
        kind: "booking",
        passengerId: "jon",
        driverId: "anna",
        bookingStatus: "confirmed",
        tripCompletedAt: null,
      }),
    ).toEqual({ ok: false, error: { code: "not_involved" } });
  });
});

describe("the time to report a booking problem (R9.1)", () => {
  const completedAt = new Date(now.getTime() - hours(24));
  const booking = {
    kind: "booking",
    passengerId: "jon",
    driverId: "anna",
    bookingStatus: "completed",
    tripCompletedAt: completedAt,
  } as const;

  it("is open before the trip completes and until 24 hours after", () => {
    expect(check("jon", { ...booking, tripCompletedAt: null })).toMatchObject({ ok: true });
    expect(check("jon", booking)).toMatchObject({ ok: true });
  });

  it("closes a second after 24 hours", () => {
    expect(check("jon", booking, "", new Date(now.getTime() + 1000))).toEqual({
      ok: false,
      error: { code: "window_closed" },
    });
  });

  it("has nothing to report for a request, or a booking that ended before its trip", () => {
    const ran = bookingStatuses.filter(
      (bookingStatus) => check("jon", { ...booking, bookingStatus }).ok,
    );
    expect(ran).toEqual(["confirmed", "completed", "no_show"]);
    expect(check("jon", { ...booking, bookingStatus: "cancelled" })).toEqual({
      ok: false,
      error: { code: "not_reportable" },
    });
  });

  it("says so for the booking page, whoever asks", () => {
    const later = new Date(now.getTime() + 1000);
    const reportable = (status: (typeof bookingStatuses)[number], at = now) =>
      bookingProblemReportable({ status, tripCompletedAt: completedAt }, at, settings);
    expect(
      bookingProblemReportable({ status: "confirmed", tripCompletedAt: null }, now, settings),
    ).toBe(true);
    expect(reportable("completed")).toBe(true);
    expect(reportable("completed", later)).toBe(false);
    expect(reportable("requested")).toBe(false);
    expect(reportable("cancelled")).toBe(false);
  });
});

describe("the description (3.1.4)", () => {
  it("takes up to 1 000 characters, counting each letter once", () => {
    expect(check("jon", { kind: "user", userId: "anna" }, "þ".repeat(1000))).toMatchObject({
      ok: true,
      value: { description: "þ".repeat(1000) },
    });
    expect(check("jon", { kind: "user", userId: "anna" }, "🚗".repeat(1000))).toMatchObject({
      ok: true,
    });
    expect(check("jon", { kind: "user", userId: "anna" }, "a".repeat(1001))).toEqual({
      ok: false,
      error: { code: "too_long" },
    });
  });

  it("is optional, and kept without the spaces around it", () => {
    expect(check("jon", { kind: "user", userId: "anna" }, "  He shouted.  ")).toMatchObject({
      ok: true,
      value: { description: "He shouted." },
    });
  });
});

describe("urgent reports and the response target (3.4.1, R9.9)", () => {
  it("makes only safety reports urgent", () => {
    expect(reportCategories.filter(isUrgent)).toEqual(["safety"]);
    expect(
      checkReport(
        "jon",
        { kind: "user", userId: "anna" },
        { category: "safety", description: "" },
        now,
        settings,
      ),
    ).toMatchObject({ ok: true, value: { urgent: true } });
  });

  it("answers every report within 24 hours", () => {
    expect(responseDueAt(now, settings)).toEqual(new Date("2026-11-21T12:00:00Z"));
  });

  it("puts urgent reports first, then the oldest", () => {
    const at = (iso: string) => new Date(`2026-11-20T${iso}:00Z`);
    const queue = [
      { id: "new", urgent: false, filedAt: at("11:00") },
      { id: "urgent-new", urgent: true, filedAt: at("11:30") },
      { id: "old", urgent: false, filedAt: at("08:00") },
      { id: "urgent-old", urgent: true, filedAt: at("09:00") },
    ];
    expect([...queue].sort(queueOrder).map((report) => report.id)).toEqual([
      "urgent-old",
      "urgent-new",
      "old",
      "new",
    ]);
  });
});

describe("a booking problem holds its payout (R9.3)", () => {
  it("holds while the report about the booking is open", () => {
    expect(holdsPayout({ subject: "booking", status: "open" })).toBe(true);
    expect(holdsPayout({ subject: "booking", status: "closed" })).toBe(false);
    expect(holdsPayout({ subject: "trip", status: "open" })).toBe(false);
  });
});

describe("how many reports a day (against abuse of reports)", () => {
  it("allows 10 in 24 hours, and refuses the 11th", () => {
    expect(reportLimitReached(9, settings)).toBe(false);
    expect(reportLimitReached(10, settings)).toBe(true);
  });
});

describe("how long a report is kept (spec 9, section 7)", () => {
  const gone = (closedAt: string, at: string) =>
    new Date(closedAt) <= reportsClosedBy(new Date(at), settings);

  it("is 3 years after it was closed", () => {
    expect(gone("2026-11-20T12:00:00Z", "2029-11-20T11:59:00Z")).toBe(false);
    expect(gone("2026-11-20T12:00:00Z", "2029-11-20T12:00:00Z")).toBe(true);
  });
});
