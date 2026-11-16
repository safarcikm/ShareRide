import { menuTabOf, menuTabs } from "./menu";

describe("menuTabOf (spec 16, 3.1)", () => {
  it("names the places in order, Messages before Profile", () => {
    expect(menuTabs.map((tab) => tab.href)).toEqual([
      "/",
      "/my-rides",
      "/offer",
      "/messages",
      "/profile",
    ]);
  });

  it("finds the place a screen belongs to", () => {
    expect(menuTabOf("/")).toBe("index");
    expect(menuTabOf("/search/results")).toBe("index");
    expect(menuTabOf("/trips/0190a1d6-0000-7000-8000-0000000000d1")).toBe("index");
    expect(menuTabOf("/my-rides")).toBe("my-rides");
    expect(menuTabOf("/bookings/0190a1d6-0000-7000-8000-0000000000b4")).toBe("my-rides");
    expect(menuTabOf("/drive/trips/new")).toBe("offer");
    expect(menuTabOf("/messages")).toBe("messages");
    expect(menuTabOf("/messages/0190a1d6-0000-7000-8000-0000000000b4")).toBe("messages");
    expect(menuTabOf("/settings")).toBe("profile");
    expect(menuTabOf("/profile/edit")).toBe("profile");
  });

  it("finds no place for screens outside the menu, and no place for look-alikes", () => {
    expect(menuTabOf("/sign-in")).toBeNull();
    expect(menuTabOf("/meeting-points")).toBeNull();
    expect(menuTabOf("/driver")).toBeNull();
  });
});
