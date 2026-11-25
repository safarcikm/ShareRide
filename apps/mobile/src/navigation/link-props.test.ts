import { router } from "expo-router";
import { Platform } from "react-native";
import { addressOf, linkProps } from "./link-props";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const push = router.push as jest.Mock;

beforeEach(() => {
  push.mockClear();
});

describe("a link to a screen (spec 23, 3.6)", () => {
  it("is an address on the web, which a click opens within the app", () => {
    jest.replaceProperty(Platform, "OS", "web");
    const link = linkProps("/meeting-points");
    expect(link.href).toBe("/meeting-points");
    const preventDefault = jest.fn();
    link.onPress({ preventDefault, button: 0 });
    expect(preventDefault).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/meeting-points");
  });

  it("leaves a click with a modifier key to the browser, such as for a new tab", () => {
    jest.replaceProperty(Platform, "OS", "web");
    const preventDefault = jest.fn();
    linkProps("/meeting-points").onPress({ preventDefault, ctrlKey: true });
    linkProps("/meeting-points").onPress({ preventDefault, metaKey: true });
    linkProps("/meeting-points").onPress({ preventDefault, button: 1 });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("is a press that opens the screen on a phone", () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const link = linkProps("/meeting-points");
    expect(link.href).toBeUndefined();
    link.onPress();
    expect(push).toHaveBeenCalledWith("/meeting-points");
  });
});

describe("the address of a link", () => {
  it("fills a pathname's segments from its params and puts the rest in the query", () => {
    expect(addressOf("/meeting-points")).toBe("/meeting-points");
    expect(addressOf({ pathname: "/legal/[type]", params: { type: "privacy" } })).toBe(
      "/legal/privacy",
    );
    expect(
      addressOf({ pathname: "/people/[profileId]", params: { profileId: "a b", from: "trip" } }),
    ).toBe("/people/a%20b?from=trip");
  });
});
