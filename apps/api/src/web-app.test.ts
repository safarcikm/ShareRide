import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import type { AppStore } from "@shareride/domain";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { createLogger } from "./logger.ts";
import { webContentSecurityPolicy } from "./web-app.ts";

const secret = "a file next to the export that must never be served";

/**
 * A small stand-in for `expo export --platform web` output, with a file next
 * to it that a path traversal would reach.
 */
function exportedWebApp(): string {
  const parent = mkdtempSync(join(tmpdir(), "shareride-web-"));
  writeFileSync(join(parent, "secret.txt"), secret);
  const dir = join(parent, "web");
  mkdirSync(dir);
  writeFileSync(
    join(dir, "index.html"),
    '<!doctype html><html lang="en"><head><title>PuffinRide</title></head><body><div id="root"></div></body></html>',
  );
  writeFileSync(join(dir, "favicon.ico"), "icon");
  mkdirSync(join(dir, "_expo", "static", "js", "web"), { recursive: true });
  writeFileSync(join(dir, "_expo", "static", "js", "web", "entry-abc123.js"), "console.log(1);");
  return dir;
}

function setup(
  webAppDir?: string,
  lines: string[] = [],
  appStores: readonly AppStore[] | Error = [],
) {
  const destination = new Writable({
    write: (chunk: Buffer, _encoding, callback) => {
      lines.push(chunk.toString());
      callback();
    },
  });
  return createApp({
    logger: createLogger({ level: "info", destination }),
    checkDatabase: () => Promise.resolve(),
    ...(webAppDir === undefined ? {} : { webAppDir }),
    appStoresListed: () =>
      appStores instanceof Error ? Promise.reject(appStores) : Promise.resolve(appStores),
  });
}

describe("the web app on the API's origin", () => {
  const app = setup(exportedWebApp());

  it("serves the app's page at the root, never cached", async () => {
    const response = await app.request("/");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(await response.text()).toContain(
      "<title>PuffinRide · Carpool and shared rides across Iceland</title>",
    );
  });

  it("limits the page to its own scripts, styles and API", async () => {
    const response = await app.request("/");
    const policy = response.headers.get("content-security-policy") ?? "";
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self'");
    // Its own API, and error reports to Sentry's EU region (ADR 0020).
    expect(policy.split("; ")).toContain("connect-src 'self' https://*.ingest.de.sentry.io");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain("unsafe-eval");
  });

  it("shows images from photo storage too (ADR 0022)", () => {
    const origin = "https://shareride-photos.hel1.your-objectstorage.com";
    expect(webContentSecurityPolicy(origin).split("; ")).toContain(
      `img-src 'self' data: blob: ${origin}`,
    );
    expect(webContentSecurityPolicy().split("; ")).toContain("img-src 'self' data: blob:");
  });

  it("lets Google Analytics load only on a site that has it (spec 23, section 6)", () => {
    const policy = webContentSecurityPolicy(null, true).split("; ");
    expect(policy).toContain("script-src 'self' https://*.googletagmanager.com");
    const google =
      "https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com";
    expect(policy).toContain(`img-src 'self' data: blob: ${google}`);
    expect(policy).toContain(
      `connect-src 'self' https://*.ingest.de.sentry.io ${google} https://*.google.com`,
    );
    expect(webContentSecurityPolicy().includes("google")).toBe(false);
  });

  it("sends that policy with the pages of a site that has Google Analytics", async () => {
    const withAnalytics = createApp({
      logger: createLogger({ level: "silent" }),
      checkDatabase: () => Promise.resolve(),
      webAppDir: exportedWebApp(),
      analytics: { googleMeasurementId: "G-ABC123XYZ9" },
    });
    const policy = (await withAnalytics.request("/")).headers.get("content-security-policy");
    expect(policy).toContain("script-src 'self' https://*.googletagmanager.com");
    expect((await app.request("/")).headers.get("content-security-policy")).not.toContain("google");
  });

  it("serves the page for the app's own routes, so a reload works", async () => {
    for (const path of ["/sign-in", "/sign-in/code", "/legal/terms"]) {
      const response = await app.request(path);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('<div id="root">');
    }
  });

  it("sends the old Terms, rules and privacy page to About, in the language asked (spec 30, 3.2)", async () => {
    const plain = await app.request("/legal");
    expect(plain.status).toBe(301);
    expect(plain.headers.get("location")).toBe("/about");
    const english = await app.request("/legal?lang=en");
    expect(english.status).toBe(301);
    expect(english.headers.get("location")).toBe("/about?lang=en");
    // The documents stay where they are.
    expect((await app.request("/legal/privacy")).status).toBe(200);
  });

  it("keeps trip pages out of search engines (R4.6; spec 23 has the rest)", async () => {
    const trip = await app.request("/trips/0190a1d6-0000-7000-8000-0000000000d1?fromStop=1");
    expect(trip.status).toBe(200);
    expect(trip.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(await trip.text()).toContain('<div id="root">');
  });

  it("serves bundles with content hashes for a year", async () => {
    const response = await app.request("/_expo/static/js/web/entry-abc123.js");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("javascript");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("lets the page open Google's or Apple's pop-up and hear back from it (ADR 0034)", async () => {
    const page = await app.request("/trips/abc");
    expect(page.headers.get("cross-origin-opener-policy")).toBe("same-origin-allow-popups");
    // The pop-up's last page, which hands the answer to the page under it.
    const back = await app.request("/sign-in/return");
    expect(back.status).toBe(200);
    expect(back.headers.get("cross-origin-opener-policy")).toBe("unsafe-none");
  });

  it("serves other files without long caching", async () => {
    const response = await app.request("/favicon.ico");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-cache");
  });

  it("keeps the API's own answers for /v1 paths", async () => {
    const missing = await app.request("/v1/no-such-endpoint");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: { code: "not_found" } });
    expect((await app.request("/v1/health")).status).toBe(200);
  });

  it("leaves the API's route names in the request log", async () => {
    const lines: string[] = [];
    const logged = setup(exportedWebApp(), lines);
    await logged.request("/v1/health");
    const entry = lines
      .map((line) => JSON.parse(line) as { msg?: string; route?: string })
      .find((line) => line.msg === "request");
    expect(entry?.route).toBe("/v1/health");
  });

  it("never serves files outside the export", async () => {
    const paths = [
      "/../secret.txt",
      "/..%2fsecret.txt",
      "/%2e%2e%2fsecret.txt",
      "/%2e%2e/secret.txt",
      "/..%5csecret.txt",
      "/_expo/%2e%2e/%2e%2e/secret.txt",
      "//secret.txt",
    ];
    for (const path of paths) {
      const response = await app.request(path);
      expect(await response.text(), path).not.toContain(secret);
    }
  });

  it("answers 404 for a missing file, not the page, so an old bundle fails clearly", async () => {
    for (const path of ["/_expo/static/js/web/entry-old.js", "/assets/gone.png", "/sitemap.xml"]) {
      const response = await app.request(path);
      expect(response.status, path).toBe(404);
      expect(response.headers.get("cache-control"), path).toBe("no-cache");
      expect(await response.json()).toMatchObject({ error: { code: "not_found" } });
    }
  });

  it("answers only reads; other methods get the API's 404", async () => {
    const response = await app.request("/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(404);
  });
});

const iphone =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 19_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Mobile/15E148 Safari/604.1";
const android =
  "Mozilla/5.0 (Linux; Android 16; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36";
const laptop =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Safari/605.1.15";

describe("the phone apps on the website (spec 35)", () => {
  const dir = exportedWebApp();
  const neither = setup(dir);
  const both = setup(dir, [], ["app_store", "google_play"]);
  const playOnly = setup(dir, [], ["google_play"]);

  it("gives Safari Apple's banner only while the App Store's page is public (3.3, R35.1)", async () => {
    expect(await (await neither.request("/")).text()).not.toContain("apple-itunes-app");
    expect(await (await playOnly.request("/")).text()).not.toContain("apple-itunes-app");
    expect(await (await both.request("/")).text()).toContain(
      '<meta name="apple-itunes-app" content="app-id=6840158626, app-argument=puffinride://"></head>',
    );
  });

  it("opens the screen the visitor came in on in the app, from its path only, never the query", async () => {
    const page = await (
      await both.request("/trips/0190a1d6-0000-7000-8000-0000000000d1?fromStop=1&lang=is")
    ).text();
    expect(page).toContain(
      '<meta name="apple-itunes-app" content="app-id=6840158626, app-argument=puffinride://trips/0190a1d6-0000-7000-8000-0000000000d1">',
    );
    // A path's odd characters stay inside the tag's value.
    const odd = await (await both.request("/places/a,b'c")).text();
    expect(odd).toContain('app-argument=puffinride://places/a%2Cb&#39;c"');
  });

  it("leaves it off the page Google's or Apple's sign-in comes back to, a pop-up", async () => {
    expect(await (await both.request("/sign-in/return")).text()).not.toContain("apple-itunes-app");
  });

  it("sends a phone from /app to its store while that store's page is public (3.7)", async () => {
    const fromIphone = await both.request("/app", { headers: { "user-agent": iphone } });
    expect(fromIphone.status).toBe(302);
    expect(fromIphone.headers.get("location")).toBe("https://apps.apple.com/app/id6840158626");
    expect(fromIphone.headers.get("cache-control")).toBe("no-store");
    expect(fromIphone.headers.get("vary")).toContain("User-Agent");
    const fromAndroid = await both.request("/app", { headers: { "user-agent": android } });
    expect(fromAndroid.headers.get("location")).toBe(
      "https://play.google.com/store/apps/details?id=is.puffinride.app&referrer=utm_source%3Dpuffinride.is%26utm_medium%3Dqr",
    );
  });

  it("sends anyone else from /app to About, in the language asked", async () => {
    for (const [app, userAgent] of [
      [both, laptop],
      [playOnly, iphone],
      [neither, android],
    ] as const) {
      const response = await app.request("/app", { headers: { "user-agent": userAgent } });
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/about");
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    const icelandic = await both.request("/app?lang=is", { headers: { "user-agent": laptop } });
    expect(icelandic.headers.get("location")).toBe("/about?lang=is");
  });

  it("still serves the website while the switches cannot be read, as if both were off", async () => {
    const lines: string[] = [];
    const unread = setup(dir, lines, new Error("the database is down"));
    const page = await unread.request("/");
    expect(page.status).toBe(200);
    expect(await page.text()).not.toContain("apple-itunes-app");
    const app = await unread.request("/app", { headers: { "user-agent": iphone } });
    expect(app.status).toBe(302);
    expect(app.headers.get("location")).toBe("/about");
    expect(lines.join("")).toContain("the app store switches could not be read");
  });
});

describe("without a web app", () => {
  it("answers 404 at the root", async () => {
    const response = await setup().request("/");
    expect(response.status).toBe(404);
  });
});
