import { describe, expect, it } from "vitest";
import { deleteArrivedBy } from "./retention.ts";

describe("how long a conversation is kept (privacy register: messages)", () => {
  const deleted = (arrivesAt: string, now: string) =>
    new Date(arrivesAt) <= deleteArrivedBy(new Date(now));

  it("is 12 months after the trip's planned arrival", () => {
    expect(deleted("2026-11-22T12:30:00Z", "2027-11-22T12:29:00Z")).toBe(false);
    expect(deleted("2026-11-22T12:30:00Z", "2027-11-22T12:30:00Z")).toBe(true);
  });

  it("counts months on the calendar, over a leap day too", () => {
    // 12 months after 29 February is 1 March, the day after 28 February.
    expect(deleted("2028-02-29T10:00:00Z", "2029-02-28T23:59:00Z")).toBe(false);
    expect(deleted("2028-02-29T10:00:00Z", "2029-03-01T10:00:00Z")).toBe(true);
  });

  it("is never sooner than 12 months when today is 29 February", () => {
    expect(deleted("2027-03-01T10:00:00Z", "2028-02-29T12:00:00Z")).toBe(false);
    expect(deleted("2027-03-01T10:00:00Z", "2028-03-01T10:00:00Z")).toBe(true);
  });
});
