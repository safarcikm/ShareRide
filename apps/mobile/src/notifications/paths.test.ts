import { existsSync } from "node:fs";
import { join } from "node:path";
import { notificationScreens } from "@shareride/contracts";
import { notificationPath } from "./paths";

const id = "0190a000-0000-7000-8000-000000000001";

describe("notificationPath", () => {
  it("opens a booking, a driver's trip, a conversation or a meeting point", () => {
    for (const path of [
      `/bookings/${id}`,
      `/drive/trips/${id}`,
      `/messages/${id}`,
      `/meeting-points/${id}`,
    ]) {
      expect(notificationPath({ path })).toBe(path);
    }
  });

  it('opens the rating screen of a booking, for "How was your trip?" (spec 20, 3.1.3)', () => {
    expect(notificationPath({ path: `/bookings/${id}/rate` })).toBe(`/bookings/${id}/rate`);
    expect(notificationPath({ path: `/drive/trips/${id}/rate` })).toBeNull();
    expect(notificationPath({ path: `/bookings/${id}/cancel` })).toBeNull();
  });

  it("opens the pages that are not about one record, as the server names them", () => {
    for (const path of [
      "/notices",
      "/settings/reports",
      "/settings/privacy/download",
      // A reply to feedback, and beta news (spec 12, 3.3.5; plan 4.7).
      "/settings/feedback",
      "/settings/beta-news",
      // The answer to a question about one's data (spec 11, 3.6).
      "/settings/privacy",
    ]) {
      expect(notificationPath({ path })).toBe(path);
    }
    expect(notificationPath({ path: "/settings/email" })).toBeNull();
  });

  it("opens every page the server may name, and each is a page of the app", () => {
    const pages = Object.values(notificationScreens);
    expect(pages.length).toBeGreaterThan(0);
    for (const path of pages) {
      expect(notificationPath({ path })).toBe(path);
      const file = join(__dirname, "..", "app", ...path.split("/").filter(Boolean));
      expect([path, existsSync(`${file}.tsx`) || existsSync(join(file, "index.tsx"))]).toEqual([
        path,
        true,
      ]);
    }
  });

  it("ignores anything else", () => {
    expect(notificationPath({ path: "https://example.com/" })).toBeNull();
    expect(notificationPath({ path: `//example.com/bookings/${id}` })).toBeNull();
    expect(notificationPath({})).toBeNull();
    expect(notificationPath(null)).toBeNull();
  });
});
