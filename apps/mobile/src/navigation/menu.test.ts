import { stepNames } from "@/trips/steps";

import { memberScreens } from "./member-screens";
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

  it("keeps a ride I drive under My rides, where it is listed, and the steps of posting under Offer (spec 31, 3.22)", () => {
    const id = "0190a1d6-0000-7000-8000-0000000000d1";
    // Every screen under a ride I drive, as its file is named: a new one
    // must be put under one of the two places here.
    const underARide = memberScreens.filter((screen) => screen.startsWith("drive/trips/[id]/"));
    const placeOf = (screen: string) =>
      menuTabOf(`/${screen.replace("[id]", id).replace(/\/index$/, "")}`);

    expect(underARide.filter((screen) => placeOf(screen) === "offer")).toEqual([
      "drive/trips/[id]/route",
      "drive/trips/[id]/time",
      "drive/trips/[id]/price",
      "drive/trips/[id]/seats",
      "drive/trips/[id]/review",
      "drive/trips/[id]/published",
    ]);
    expect(underARide.filter((screen) => placeOf(screen) === "my-rides")).toEqual([
      "drive/trips/[id]/index",
      "drive/trips/[id]/share",
      "drive/trips/[id]/message",
      "drive/trips/[id]/cancel",
      "drive/trips/[id]/edit/index",
      "drive/trips/[id]/edit/time",
      "drive/trips/[id]/edit/price",
      "drive/trips/[id]/edit/seats",
      "drive/trips/[id]/edit/car",
      "drive/trips/[id]/edit/stop",
      "drive/trips/[id]/edit/remove-stop",
      "drive/trips/[id]/edit/booking",
      "drive/trips/[id]/edit/details",
      "drive/trips/[id]/edit/check",
    ]);
  });

  it("puts every step of posting a ride under Offer (spec 31, 3.22)", () => {
    const ride = "/drive/trips/0190a1d6-0000-7000-8000-0000000000d1";
    expect(stepNames.map((step) => menuTabOf(`${ride}/${step}`))).toEqual(
      stepNames.map(() => "offer"),
    );
  });

  it("keeps the rest of driving under Offer", () => {
    expect(
      ["/drive/trips/new", "/drive/cars", "/drive/cars/new", "/drive/licence"].map(menuTabOf),
    ).toEqual(["offer", "offer", "offer", "offer"]);
  });

  it("finds no place for screens outside the menu, and no place for look-alikes", () => {
    expect(menuTabOf("/sign-in")).toBeNull();
    expect(menuTabOf("/meeting-points")).toBeNull();
    expect(menuTabOf("/driver")).toBeNull();
  });
});
