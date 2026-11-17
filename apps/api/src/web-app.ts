import { serveStatic } from "@hono/node-server/serve-static";
import type { Context } from "hono";
import { isConsolePath } from "./admin-app.ts";
import type { AppEnv } from "./context.ts";

const isApiPath = (path: string) =>
  path === "/v1" ||
  path.startsWith("/v1/") ||
  path === "/admin/v1" ||
  path.startsWith("/admin/v1/");

/** Expo puts content-hashed bundles here, so they never change. */
const isHashed = (path: string) => path.startsWith("/_expo/static/");

/**
 * A request for a file rather than a screen: under the export's folders, or
 * a name with an extension. A missing one gets a 404, not the page, so a tab
 * still running an old version fails clearly when it asks for a removed
 * bundle.
 */
const isFilePath = (path: string) =>
  path.startsWith("/_expo/") ||
  path.startsWith("/assets/") ||
  (path.split("/").at(-1) ?? "").includes(".");

/**
 * The web app loads only its own files and calls only its own origin, plus
 * Sentry's EU region for error reports (ADR 0020). Styles may be inline
 * because React Native Web writes them at run time. Images may also come
 * from photo storage (ADR 0022).
 */
export const webContentSecurityPolicy = (photoOrigin: string | null = null) =>
  [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    photoOrigin === null
      ? "img-src 'self' data: blob:"
      : `img-src 'self' data: blob: ${photoOrigin}`,
    "font-src 'self' data:",
    "connect-src 'self' https://*.ingest.de.sentry.io",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

/**
 * Trip pages show a person's first name and travel plans, so search engines
 * must not index them (spec 4, R4.6). The page adds a robots meta tag too.
 */
const isTripPage = (path: string) => path.startsWith("/trips/");

/** Lets serveStatic report a miss instead of running another handler. */
const reportMiss = () => Promise.resolve();

export type WebApp = (c: Context<AppEnv, string>) => Promise<Response | undefined>;

/**
 * Serves the exported web app (`expo export --platform web`) on the API's own
 * origin, so the refresh cookie stays first-party (ADR 0018). It answers only
 * reads that no API route took: files come from the export, and any other
 * path outside /v1 that names a screen gets the app's page, whose router
 * shows it. Returns undefined for everything else, which gets the API's 404.
 * Running after the routes, not as a route, keeps API route names in logs.
 */
export function createWebApp(root: string, photoOrigin: string | null = null): WebApp {
  const contentSecurityPolicy = webContentSecurityPolicy(photoOrigin);
  const files = serveStatic<AppEnv>({ root });
  const page = serveStatic<AppEnv>({ root, path: "index.html" });

  return async (c) => {
    const read = c.req.method === "GET" || c.req.method === "HEAD";
    // The console's paths are never the app's, even when the console is not
    // built: a setup link must not open the public web app (ADR 0028).
    if (!read || isApiPath(c.req.path) || isConsolePath(c.req.path)) return undefined;
    // Set before serving: serveStatic builds its response straight away.
    c.header("Content-Security-Policy", contentSecurityPolicy);
    c.header(
      "Cache-Control",
      isHashed(c.req.path) ? "public, max-age=31536000, immutable" : "no-cache",
    );
    const file = await files(c, reportMiss);
    if (file instanceof Response) return file;
    // Neither the 404 nor the page may be kept as if it were a bundle.
    c.header("Cache-Control", "no-cache");
    if (isFilePath(c.req.path)) return undefined;
    if (isTripPage(c.req.path)) c.header("X-Robots-Tag", "noindex, nofollow");
    const fallback = await page(c, reportMiss);
    return fallback instanceof Response ? fallback : undefined;
  };
}
