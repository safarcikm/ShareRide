// Google's tag (gtag.js), loaded from the app's own code once the visitor
// accepts (spec 23, 3.3; ADR 0045): no inline script, so the page's policy
// allows only Google's file, and only on a site that has a measurement ID.
import { googleCookieExpirySeconds } from "@shareride/domain";

/**
 * What Google's tag needs from the page. The browser's is `host.web.ts`;
 * tests give a stand-in.
 */
export interface AnalyticsHost {
  /** The site's own origin, such as https://puffinride.is. */
  readonly origin: string;
  /** The address the visitor came from, as the browser gives it. */
  readonly referrer: string;
  /** The query of the address the site was opened at, such as `?utm_source=flyer`. */
  readonly search: string;
  /** The page's global object, where the tag reads its queue and its off switch. */
  readonly globals: Record<string, unknown>;
  /** Adds a script that loads by itself. */
  addScript(src: string): void;
  /** The names of the cookies the page can see. */
  cookieNames(): readonly string[];
  /** Removes a cookie, for this host and the domains above it. */
  removeCookie(name: string): void;
  /** Loads the page again. */
  reload(): void;
  /** Calls `listener` when another tab changes `key` in the browser's storage; returns a stop. */
  onStorage(key: string, listener: () => void): () => void;
}

export interface GoogleTag {
  /** Counts a screen, by its pattern only (R23.3). */
  pageView(pattern: string): void;
  /** Stops counting at once and removes Google's cookies (R23.4). */
  stop(): void;
}

type Gtag = (...command: unknown[]) => void;

/**
 * The referrer as Google Analytics may have it: another site's origin only,
 * never its path or query, and nothing for this site or an app (3.3, item 2).
 */
export function referrerOrigin(referrer: string, ownOrigin: string): string | null {
  try {
    const { origin } = new URL(referrer);
    return origin === "null" || origin === ownOrigin ? null : `${origin}/`;
  } catch {
    return null;
  }
}

const campaignKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
const campaignValue = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * The campaign tags of the address, such as `?utm_source=flyer&utm_medium=qr`,
 * which our own ads' and flyers' links carry, so Google Analytics can say
 * which brought a visit (3.3, item 1). Only those five tags, and only plain
 * values: letters, digits, dots, dashes and underscores, as we write them,
 * never free text. Empty when there are none.
 */
export function campaignTags(search: string): string {
  const query = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const key of campaignKeys) {
    const value = query.get(key);
    if (value !== null && campaignValue.test(value)) kept.set(key, value);
  }
  const tags = kept.toString();
  return tags === "" ? "" : `?${tags}`;
}

/**
 * What the page writes to remove a cookie: Google sets its cookies on the
 * highest domain it can, such as .puffinride.is, so each domain from the
 * host up is cleared (a browser ignores one it would not take, such as
 * `is`), and last the host's own.
 */
export function cookieRemovals(name: string, hostname: string): string[] {
  const labels = hostname.split(".");
  return [
    ...labels.map(
      (_, start) => `${name}=; Max-Age=0; Path=/; Domain=${labels.slice(start).join(".")}`,
    ),
    `${name}=; Max-Age=0; Path=/`,
  ];
}

/** Removes Google Analytics' cookies, `_ga` and `_ga_<ID>`, from this browser. */
export function removeGoogleCookies(host: AnalyticsHost): void {
  for (const name of host.cookieNames()) {
    if (name === "_ga" || name.startsWith("_ga_")) host.removeCookie(name);
  }
}

/**
 * Starts Google's tag for the measurement ID: consent for analytics only,
 * no page view of its own (the app sends them by pattern), Google signals and
 * ads personalisation off, cookies for 13 months that a visit does not
 * extend. Once loaded in a page, the script is not loaded again.
 */
export function startGoogleTag(host: AnalyticsHost, id: string): GoogleTag {
  const off = `ga-disable-${id}`;
  host.globals[off] = false;
  const loaded = host.globals["gtag"] as Gtag | undefined;
  let gtag: Gtag;
  if (loaded === undefined) {
    const queue: unknown[] = Array.isArray(host.globals["dataLayer"])
      ? (host.globals["dataLayer"] as unknown[])
      : [];
    host.globals["dataLayer"] = queue;
    gtag = function () {
      // Google's tag reads each command as a call's own arguments object.
      // eslint-disable-next-line prefer-rest-params
      queue.push(arguments);
    };
    host.globals["gtag"] = gtag;
    gtag("consent", "default", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    gtag("js", new Date());
    gtag("config", id, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: googleCookieExpirySeconds,
      cookie_update: false,
    });
    host.addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
  } else {
    gtag = loaded;
    gtag("consent", "update", { analytics_storage: "granted" });
  }
  let previous: string | null = null;
  return {
    pageView(pattern) {
      const fields = {
        // The first screen keeps the campaign tags of the link it came from.
        page_location: `${host.origin}${pattern}${previous === null ? campaignTags(host.search) : ""}`,
        page_title: pattern,
        // The first screen names the site the visitor came from; the next
        // ones, the screen before, by its pattern.
        page_referrer:
          previous === null
            ? (referrerOrigin(host.referrer, host.origin) ?? `${host.origin}/`)
            : `${host.origin}${previous}`,
      };
      // Set as well, so what the tag sends by itself carries the same.
      gtag("set", fields);
      gtag("event", "page_view", fields);
      previous = pattern;
    },
    stop() {
      host.globals[off] = true;
      gtag("consent", "update", { analytics_storage: "denied" });
      removeGoogleCookies(host);
    },
  };
}
