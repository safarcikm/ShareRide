import { describe, expect, it } from "vitest";
import {
  appLinkTarget,
  appStoresListed,
  storeOfUserAgent,
  storePage,
  storePages,
} from "./app-stores.ts";
import { defaultSettingValues } from "./settings/values.ts";

// Sample user agents, as browsers send them (2026).
const iphoneSafari =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 19_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Mobile/15E148 Safari/604.1";
const iphoneChrome =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 19_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.0.0 Mobile/15E148 Safari/604.1";
const androidChrome =
  "Mozilla/5.0 (Linux; Android 16; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36";
const androidTablet =
  "Mozilla/5.0 (Linux; Android 16; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const ipad =
  "Mozilla/5.0 (iPad; CPU OS 19_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Mobile/15E148 Safari/604.1";
const macSafari =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Safari/605.1.15";
const windowsEdge =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0";

describe("storeOfUserAgent (spec 35, 3.7)", () => {
  it("is the App Store on an iPhone, in any browser", () => {
    expect(storeOfUserAgent(iphoneSafari)).toBe("app_store");
    expect(storeOfUserAgent(iphoneChrome)).toBe("app_store");
  });

  it("is Google Play on an Android phone or tablet", () => {
    expect(storeOfUserAgent(androidChrome)).toBe("google_play");
    expect(storeOfUserAgent(androidTablet)).toBe("google_play");
  });

  it("is none on an iPad, a laptop or without a user agent (the app is for iPhones only)", () => {
    expect(storeOfUserAgent(ipad)).toBeNull();
    expect(storeOfUserAgent(macSafari)).toBeNull();
    expect(storeOfUserAgent(windowsEdge)).toBeNull();
    expect(storeOfUserAgent("")).toBeNull();
    expect(storeOfUserAgent(null)).toBeNull();
  });
});

describe("appLinkTarget (spec 35, 3.7 and R35.1)", () => {
  it("sends a phone to its store while that store's page is public", () => {
    expect(appLinkTarget(iphoneSafari, ["app_store", "google_play"])).toBe("app_store");
    expect(appLinkTarget(androidChrome, ["app_store", "google_play"])).toBe("google_play");
    expect(appLinkTarget(androidChrome, ["google_play"])).toBe("google_play");
  });

  it("sends nobody to a store whose switch is off, nor a laptop anywhere", () => {
    expect(appLinkTarget(iphoneSafari, ["google_play"])).toBeNull();
    expect(appLinkTarget(androidChrome, ["app_store"])).toBeNull();
    expect(appLinkTarget(iphoneSafari, [])).toBeNull();
    expect(appLinkTarget(macSafari, ["app_store", "google_play"])).toBeNull();
  });
});

describe("storePage (spec 35, 3.8)", () => {
  it("is the App Store's page by the app's Apple ID, with nothing added", () => {
    expect(storePage("app_store")).toBe("https://apps.apple.com/app/id6840158626");
    expect(storePage("app_store", "footer")).toBe("https://apps.apple.com/app/id6840158626");
  });

  it("is Google Play's page by the package, with the website's install referrer for a place", () => {
    expect(storePage("google_play")).toBe(
      "https://play.google.com/store/apps/details?id=is.puffinride.app",
    );
    expect(storePage("google_play", "banner")).toBe(
      "https://play.google.com/store/apps/details?id=is.puffinride.app&referrer=utm_source%3Dpuffinride.is%26utm_medium%3Dbanner",
    );
    const [, referrer = ""] = storePage("google_play", "qr").split("&referrer=");
    expect(decodeURIComponent(referrer)).toBe("utm_source=puffinride.is&utm_medium=qr");
  });

  it("gives the store apps' own addresses for the phone apps (spec 32, 3.6)", () => {
    expect(storePages.app_store.app).toBe("itms-apps://apps.apple.com/app/id6840158626");
    expect(storePages.google_play.app).toBe("market://details?id=is.puffinride.app");
  });
});

describe("appStoresListed (ADR 0055)", () => {
  it("lists none by default: both switches start off", () => {
    expect(appStoresListed(defaultSettingValues)).toEqual([]);
  });

  it("lists the stores whose switch is on, the App Store first", () => {
    const values = { ...defaultSettingValues, app_store_listed: 1, google_play_listed: 1 };
    expect(appStoresListed(values)).toEqual(["app_store", "google_play"]);
    expect(appStoresListed({ ...defaultSettingValues, google_play_listed: 1 })).toEqual([
      "google_play",
    ]);
  });
});
