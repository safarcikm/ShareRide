import { googleCookieExpirySeconds } from "@shareride/domain";
import {
  campaignTags,
  cookieRemovals,
  referrerOrigin,
  removeGoogleCookies,
  startGoogleTag,
  type AnalyticsHost,
} from "./google-tag";

// Google's tag, loaded only after the visitor accepts (spec 23, 3.3): what it
// is told, and how it stops.

const id = "G-ABC123XYZ9";

function fakeHost(referrer = "", search = "") {
  const cookies = new Set(["_ga", `_ga_ABC123XYZ9`, "other"]);
  const scripts: string[] = [];
  const globals: Record<string, unknown> = {};
  const host: AnalyticsHost = {
    origin: "https://puffinride.is",
    referrer,
    search,
    globals,
    addScript: (src) => scripts.push(src),
    cookieNames: () => [...cookies],
    removeCookie: (name) => cookies.delete(name),
    reload: () => undefined,
    onStorage: () => () => undefined,
  };
  /** The commands given to Google's tag, each as the list of its arguments. */
  const commands = () =>
    ((globals["dataLayer"] ?? []) as IArguments[]).map((entry) => [...entry] as unknown[]);
  return { host, cookies, scripts, globals, commands };
}

const pageViews = (commands: unknown[][]) =>
  commands.filter((command) => command[0] === "event" && command[1] === "page_view");

describe("Google's tag", () => {
  it("loads Google's script once, with page views, signals and ads personalisation off", () => {
    const page = fakeHost();
    startGoogleTag(page.host, id);
    expect(page.scripts).toEqual([`https://www.googletagmanager.com/gtag/js?id=${id}`]);
    const commands = page.commands();
    expect(commands).toContainEqual([
      "consent",
      "default",
      {
        analytics_storage: "granted",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      },
    ]);
    expect(commands).toContainEqual([
      "config",
      id,
      {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        cookie_expires: googleCookieExpirySeconds,
        cookie_update: false,
      },
    ]);
    expect(pageViews(commands)).toEqual([]);
    expect(page.globals[`ga-disable-${id}`]).toBe(false);
  });

  it("gives its commands in order, so nothing is sent before the fields are set", () => {
    const page = fakeHost();
    startGoogleTag(page.host, id).pageView("/");
    expect(page.commands().map((command) => command[0])).toEqual([
      "consent",
      "js",
      "config",
      "set",
      "event",
    ]);
  });

  it("names each screen by its pattern, and the site it came from only by its origin", () => {
    const page = fakeHost("https://www.facebook.com/groups/123/posts/456?ref=share");
    const tag = startGoogleTag(page.host, id);
    tag.pageView("/trips/[id]");
    tag.pageView("/meeting-points");
    const first = {
      page_location: "https://puffinride.is/trips/[id]",
      page_title: "/trips/[id]",
      page_referrer: "https://www.facebook.com/",
    };
    const second = {
      page_location: "https://puffinride.is/meeting-points",
      page_title: "/meeting-points",
      page_referrer: "https://puffinride.is/trips/[id]",
    };
    const commands = page.commands();
    expect(pageViews(commands)).toEqual([
      ["event", "page_view", first],
      ["event", "page_view", second],
    ]);
    // The same fields for what the tag sends by itself, such as time on the page.
    expect(commands).toContainEqual(["set", first]);
    expect(commands).toContainEqual(["set", second]);
  });

  it("keeps the campaign tags of an ad's or a flyer's link on the first screen only", () => {
    const page = fakeHost(
      "",
      "?lang=is&utm_source=flyer&utm_medium=qr&utm_campaign=launch-2026&from=0190a1d6&utm_content=Anna%20123",
    );
    const tag = startGoogleTag(page.host, id);
    tag.pageView("/");
    tag.pageView("/meeting-points");
    expect(
      pageViews(page.commands()).map(
        (command) => (command[2] as { page_location: string }).page_location,
      ),
    ).toEqual([
      "https://puffinride.is/?utm_source=flyer&utm_medium=qr&utm_campaign=launch-2026",
      "https://puffinride.is/meeting-points",
    ]);
  });

  it("stops at once, and removes Google's cookies (R23.4)", () => {
    const page = fakeHost();
    const tag = startGoogleTag(page.host, id);
    tag.stop();
    expect(page.globals[`ga-disable-${id}`]).toBe(true);
    expect(page.commands()).toContainEqual(["consent", "update", { analytics_storage: "denied" }]);
    expect([...page.cookies]).toEqual(["other"]);
  });

  it("starts again in the same page without loading the script twice", () => {
    const page = fakeHost();
    startGoogleTag(page.host, id).stop();
    startGoogleTag(page.host, id).pageView("/");
    expect(page.scripts).toHaveLength(1);
    expect(page.globals[`ga-disable-${id}`]).toBe(false);
    expect(page.commands()).toContainEqual(["consent", "update", { analytics_storage: "granted" }]);
    expect(pageViews(page.commands())).toHaveLength(1);
  });

  it("removes Google's cookies on their own, as when the visitor declines", () => {
    const page = fakeHost();
    removeGoogleCookies(page.host);
    expect([...page.cookies]).toEqual(["other"]);
    expect(page.scripts).toEqual([]);
  });
});

describe("removing a cookie of Google's (R23.4)", () => {
  it("clears it on this host and each domain above it, as Google sets it on the highest", () => {
    expect(cookieRemovals("_ga", "www.puffinride.is")).toEqual([
      "_ga=; Max-Age=0; Path=/; Domain=www.puffinride.is",
      "_ga=; Max-Age=0; Path=/; Domain=puffinride.is",
      "_ga=; Max-Age=0; Path=/; Domain=is",
      "_ga=; Max-Age=0; Path=/",
    ]);
    expect(cookieRemovals("_ga", "localhost")).toEqual([
      "_ga=; Max-Age=0; Path=/; Domain=localhost",
      "_ga=; Max-Age=0; Path=/",
    ]);
  });
});

describe("the campaign tags Google may have (3.3, item 1)", () => {
  it("are utm_ tags only, of letters, digits, dots, dashes and underscores", () => {
    expect(campaignTags("?utm_source=facebook&utm_medium=paid&utm_term=x")).toBe(
      "?utm_source=facebook&utm_medium=paid&utm_term=x",
    );
    expect(campaignTags("?utm_campaign=hello%20world&utm_source=fb")).toBe("?utm_source=fb");
    expect(campaignTags(`?utm_source=${"a".repeat(101)}`)).toBe("");
    expect(campaignTags("?lang=en&gclid=abc&fbclid=def")).toBe("");
    expect(campaignTags("")).toBe("");
  });
});

describe("the referrer Google may have (3.3, item 2)", () => {
  const own = "https://puffinride.is";

  it("is another site's origin, or nothing", () => {
    expect(referrerOrigin("https://www.google.com/search?q=samfer%C3%B0a", own)).toBe(
      "https://www.google.com/",
    );
    expect(referrerOrigin("https://puffinride.is/trips/abc", own)).toBeNull();
    expect(referrerOrigin("", own)).toBeNull();
    expect(referrerOrigin("not an address", own)).toBeNull();
    expect(referrerOrigin("android-app://com.google.android.gm/", own)).toBeNull();
  });
});
