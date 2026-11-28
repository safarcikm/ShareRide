import {
  appLinkTarget,
  appStoreAppId,
  providerReturnPath,
  storePage,
  type AppStore,
} from "@shareride/domain";

// The phone apps on the website (spec 35): Apple's banner in the page's
// head, and `/app`, the one address that sends each phone to its store.

/** The stores whose page is public now (ADR 0055), read within 5 seconds. */
export type ListedAppStores = () => Promise<readonly AppStore[]>;

/** The address the QR code holds; a download link that stays in the browser (spec 32, 3.5). */
export const appLinkPath = "/app";

const escapeAttribute = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/**
 * Apple's Smart App Banner for a page (spec 35, 3.3): Safari on an iPhone
 * shows it at the top, with Open where the app is installed, which opens
 * the same screen there through `app-argument`, the page's path in the
 * app's own address. Only the path, as the address's encoded form, with
 * commas encoded too, as they part the tag's values. Null on the page
 * Google's or Apple's sign-in comes back to, a pop-up.
 */
export function appleAppBanner(pathname: string): string | null {
  if (pathname === `/${providerReturnPath}`) return null;
  const path = pathname.replace(/^\/+/, "").replaceAll(",", "%2C");
  const content = `app-id=${appStoreAppId}, app-argument=puffinride://${path}`;
  // Not marked as the app's head component marks its own, so it stays.
  return `<meta name="apple-itunes-app" content="${escapeAttribute(content)}">`;
}

/** Adds Apple's banner to a page that is already filled, at the end of its head. */
export function withAppleAppBanner(html: string, pathname: string): string {
  const banner = appleAppBanner(pathname);
  return banner === null ? html : html.replace("</head>", () => `${banner}</head>`);
}

/**
 * Where `/app` sends a browser (spec 35, 3.7): its phone's store while that
 * store's page is public, through the QR code's own referrer on Google
 * Play; About otherwise, in the language the address names.
 */
export function appLinkLocation(
  userAgent: string | null,
  listed: readonly AppStore[],
  lang: string | null,
): string {
  const store = appLinkTarget(userAgent, listed);
  if (store !== null) return storePage(store, "qr");
  return lang === null ? "/about" : `/about?lang=${encodeURIComponent(lang)}`;
}
