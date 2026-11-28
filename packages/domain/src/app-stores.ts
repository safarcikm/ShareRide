import type { SettingValues } from "./settings/values.ts";

// The phone apps in the stores (spec 32), and how the website shows them
// (spec 35): each store's page, which store a browser's phone uses, and
// which stores the operator says are public (ADR 0055).

export const appStores = ["app_store", "google_play"] as const;
export type AppStore = (typeof appStores)[number];

/** The app's Apple ID in App Store Connect, as `eas.json` has it (`ascAppId`). */
export const appStoreAppId = "6840158626";

/** The app's package on Google Play, and its bundle ID on the iPhone. */
export const appPackage = "is.puffinride.app";

/**
 * PuffinRide's page in each store: in the store's own app, from the phone
 * apps (spec 32, 3.6), and on the web, which a phone also opens in the
 * store's app.
 */
export const storePages = {
  app_store: {
    app: `itms-apps://apps.apple.com/app/id${appStoreAppId}`,
    web: `https://apps.apple.com/app/id${appStoreAppId}`,
  },
  google_play: {
    app: `market://details?id=${appPackage}`,
    web: `https://play.google.com/store/apps/details?id=${appPackage}`,
  },
} as const satisfies Record<AppStore, { app: string; web: string }>;

/** Where on the website a link to a store is (spec 35, 3.8). */
export type StoreLinkPlace = "banner" | "footer" | "about" | "qr";

/**
 * A store's web page. For Google Play, a place on the website adds Google's
 * install referrer, so the Play Console counts installs that came from it;
 * it names no one. The App Store's campaign links need the provider token
 * (spec 35, section 10), so its page has nothing added.
 */
export function storePage(store: AppStore, place?: StoreLinkPlace): string {
  const page = storePages[store].web;
  if (store !== "google_play" || place === undefined) return page;
  const referrer = `utm_source=puffinride.is&utm_medium=${place}`;
  return `${page}&referrer=${encodeURIComponent(referrer)}`;
}

/**
 * The store of the phone a browser runs on, from its user agent: the App
 * Store on an iPhone, Google Play on Android. None on an iPad, as the app
 * is for iPhones only (spec 32, 3.1), on a computer, or without one.
 */
export function storeOfUserAgent(userAgent: string | null | undefined): AppStore | null {
  if (userAgent === null || userAgent === undefined) return null;
  if (/\b(iPhone|iPod)\b/.test(userAgent)) return "app_store";
  if (/\bAndroid\b/.test(userAgent)) return "google_play";
  return null;
}

/**
 * Where `/app` sends a browser (spec 35, 3.7): to its phone's store while
 * that store's page is public; otherwise null, and it goes to About.
 */
export function appLinkTarget(
  userAgent: string | null | undefined,
  listed: readonly AppStore[],
): AppStore | null {
  const store = storeOfUserAgent(userAgent);
  return store !== null && listed.includes(store) ? store : null;
}

/** The stores whose page the operator says is public (ADR 0055), the App Store first. */
export function appStoresListed(values: SettingValues): AppStore[] {
  return appStores.filter((store) => values[`${store}_listed`] === 1);
}
