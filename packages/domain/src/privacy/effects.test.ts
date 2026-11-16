import { describe, expect, it } from "vitest";
import { deletionEffects, personalDataCategories } from "./effects.ts";

describe("what deletion does to each kind of data (spec 11, 3.5; R11.4)", () => {
  it("gives every category one effect", () => {
    expect(Object.keys(deletionEffects).sort()).toEqual([...personalDataCategories].sort());
  });

  it("erases the profile, devices, consents, cars, exports and reviews received", () => {
    for (const category of [
      "account",
      "devices",
      "consents",
      "notification_log",
      "vehicles",
      "exports",
      "reviews_received",
      "blocks",
    ] as const) {
      expect(deletionEffects[category]).toBe("erase");
    }
  });

  it("empties messages sent, so the other person sees they were deleted", () => {
    expect(deletionEffects.messages).toBe("empty");
  });

  it("keeps trips, bookings, reviews written, reports and requests without the person", () => {
    for (const category of [
      "trips_and_bookings",
      "reviews_written",
      "moderation",
      "privacy_requests",
    ] as const) {
      expect(deletionEffects[category]).toBe("move");
    }
  });

  it("keeps payments and the audit log as they are", () => {
    expect(deletionEffects.payments).toBe("keep");
    expect(deletionEffects.audit).toBe("keep");
  });
});
