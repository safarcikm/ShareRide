import { router } from "expo-router";
import { Linking, Platform } from "react-native";
import { addressOf, externalLinkProps, linkProps } from "./link-props";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

const push = router.push as jest.Mock;
const replace = router.replace as jest.Mock;

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
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

describe("a link that takes its screen's place (spec 31, 3.21)", () => {
  it.each(["web", "ios"] as const)("puts the screen where this one was, on %s", (os) => {
    jest.replaceProperty(Platform, "OS", os);
    const link = linkProps("/", "replace");
    // Still an address on the web, for a new tab and for search engines.
    expect(link.href).toBe(os === "web" ? "/" : undefined);
    link.onPress({ preventDefault: jest.fn(), button: 0 });
    expect(replace).toHaveBeenCalledWith("/");
    expect(push).not.toHaveBeenCalled();
  });
});

describe("a link outside the app (spec 30, 3.1)", () => {
  it("is an address the browser opens on the web: a web page in a new tab, told nothing", () => {
    jest.replaceProperty(Platform, "OS", "web");
    expect(externalLinkProps("https://www.facebook.com/profile.php?id=1")).toEqual({
      href: "https://www.facebook.com/profile.php?id=1",
      hrefAttrs: { target: "_blank", rel: "noopener noreferrer" },
    });
    expect(externalLinkProps("mailto:admin@puffinride.is")).toEqual({
      href: "mailto:admin@puffinride.is",
    });
  });

  it("is a press that opens the browser or the mail app on a phone", () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const openURL = jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("No mail app"));
    const link = externalLinkProps("mailto:admin@puffinride.is");
    expect(link.href).toBeUndefined();
    link.onPress?.();
    expect(openURL).toHaveBeenCalledWith("mailto:admin@puffinride.is");
    openURL.mockRestore();
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
