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

  it("ignores anything else", () => {
    expect(notificationPath({ path: "https://example.com/" })).toBeNull();
    expect(notificationPath({ path: `//example.com/bookings/${id}` })).toBeNull();
    expect(notificationPath({})).toBeNull();
    expect(notificationPath(null)).toBeNull();
  });
});
