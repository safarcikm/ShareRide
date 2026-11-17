import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  checkReview,
  defaultReviewSettings as settings,
  isRevealed,
  ratingOf,
  reviewClosesAt,
  reviewMaxLength,
  reviewReminderAt,
  type ReviewToCheck,
} from "./review.ts";

const day = 86_400_000;
const completedAt = new Date("2026-11-20T11:30:00Z");
const after = (days: number) => new Date(completedAt.getTime() + days * day);

const good: ReviewToCheck = {
  bookingStatus: "completed",
  completedAt,
  alreadyReviewed: false,
  openReport: false,
  rating: 5,
  comment: "  Lovely trip, on time.  ",
};

describe("writing a review (R8.8)", () => {
  it("takes 1 to 5 stars and a comment, trimmed, on a completed booking", () => {
    expect(checkReview(good, after(1), settings)).toEqual({
      ok: true,
      value: { rating: 5, comment: "Lovely trip, on time." },
    });
    expect(checkReview({ ...good, rating: 1, comment: "" }, after(1), settings)).toEqual({
      ok: true,
      value: { rating: 1, comment: "" },
    });
  });

  it.each(["confirmed", "cancelled", "no_show"] as const)(
    "refuses a %s booking: only completed ones are reviewed",
    (bookingStatus) => {
      expect(checkReview({ ...good, bookingStatus }, after(1), settings)).toEqual({
        ok: false,
        error: { code: "not_completed" },
      });
    },
  );

  it("is open for 14 days after completion", () => {
    expect(checkReview(good, new Date(after(14).getTime() - 1), settings).ok).toBe(true);
    expect(checkReview(good, after(14), settings)).toEqual({
      ok: false,
      error: { code: "review_window_closed" },
    });
  });

  it("waits while the passenger's report that the driver didn't come is open (3.4)", () => {
    expect(checkReview({ ...good, openReport: true }, after(1), settings)).toEqual({
      ok: false,
      error: { code: "report_open" },
    });
  });

  it("takes one review per author per booking, never edited", () => {
    expect(checkReview({ ...good, alreadyReviewed: true }, after(1), settings)).toEqual({
      ok: false,
      error: { code: "already_reviewed" },
    });
  });

  it.each([0, 6, 4.5, Number.NaN])("refuses a rating of %d", (rating) => {
    expect(checkReview({ ...good, rating }, after(1), settings)).toEqual({
      ok: false,
      error: { code: "rating_invalid" },
    });
  });

  it("refuses a comment over 500 characters", () => {
    const comment = "a".repeat(reviewMaxLength + 1);
    expect(checkReview({ ...good, comment }, after(1), settings)).toEqual({
      ok: false,
      error: { code: "comment_too_long" },
    });
    expect(checkReview({ ...good, comment: comment.slice(1) }, after(1), settings).ok).toBe(true);
  });

  it("refuses phone numbers, email addresses and links", () => {
    const comment = "Call me on 555 1234 or see example.is";
    expect(checkReview({ ...good, comment }, after(1), settings)).toEqual({
      ok: false,
      error: { code: "comment_has_contact_details", kinds: ["phone", "link"] },
    });
  });
});

describe("the time to review (R8.8; spec 8, 3.7.6)", () => {
  it("closes 14 days after completion", () => {
    expect(reviewClosesAt(completedAt, settings)).toEqual(after(14));
  });

  it("reminds once, 3 days after completion, while that is still ahead", () => {
    expect(reviewReminderAt(completedAt, after(0), settings)).toEqual(after(3));
    expect(reviewReminderAt(completedAt, after(2.9), settings)).toEqual(after(3));
  });

  it("does not remind when that moment has passed, as for a ride the operator found happened", () => {
    expect(reviewReminderAt(completedAt, after(3), settings)).toBeNull();
    expect(reviewReminderAt(completedAt, after(5), settings)).toBeNull();
  });
});

describe("when reviews are revealed (R8.9)", () => {
  it("reveals them once both sides have reviewed", () => {
    expect(isRevealed({ completedAt, bothReviewed: true }, after(1), settings)).toBe(true);
  });

  it("keeps a lone review hidden until 14 days after completion", () => {
    const one = { completedAt, bothReviewed: false };
    expect(isRevealed(one, new Date(after(14).getTime() - 1), settings)).toBe(false);
    expect(isRevealed(one, after(14), settings)).toBe(true);
  });
});

describe("the rating on a profile (spec 8, 3.7.5)", () => {
  it("averages the revealed ratings to one decimal, with their count", () => {
    expect(
      ratingOf([
        { rating: 5, revealed: true, hidden: false },
        { rating: 4, revealed: true, hidden: false },
        { rating: 4, revealed: true, hidden: false },
      ]),
    ).toEqual({ average: 4.3, count: 3 });
  });

  it("leaves out reviews not yet revealed and reviews the operator hid", () => {
    expect(
      ratingOf([
        { rating: 5, revealed: true, hidden: false },
        { rating: 1, revealed: false, hidden: false },
        { rating: 1, revealed: true, hidden: true },
      ]),
    ).toEqual({ average: 5, count: 1 });
  });

  it("has no average without a rating", () => {
    expect(ratingOf([])).toEqual({ average: null, count: 0 });
  });

  it("always matches the shown reviews it comes from, and a hidden review never moves it", () => {
    const review = fc.record({
      rating: fc.integer({ min: 1, max: 5 }),
      revealed: fc.boolean(),
      hidden: fc.boolean(),
    });
    fc.assert(
      fc.property(fc.array(review), review, (reviews, extra) => {
        const shown = reviews.filter((r) => r.revealed && !r.hidden);
        const rating = ratingOf(reviews);
        expect(rating.count).toBe(shown.length);
        if (shown.length === 0) {
          expect(rating.average).toBeNull();
        } else {
          const mean = shown.reduce((sum, r) => sum + r.rating, 0) / shown.length;
          expect(Math.abs((rating.average ?? 0) - mean)).toBeLessThanOrEqual(0.05 + 1e-9);
        }
        const unshown = { ...extra, revealed: false };
        expect(ratingOf([...reviews, unshown])).toEqual(rating);
        expect(ratingOf([...reviews, { ...extra, hidden: true }])).toEqual(rating);
      }),
    );
  });
});
