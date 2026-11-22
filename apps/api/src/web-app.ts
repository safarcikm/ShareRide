import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { finishProviderSignInRoute } from "@shareride/contracts";
import { providerReturnPath } from "@shareride/domain";
import type { Context } from "hono";
import { isConsolePath } from "./admin-app.ts";
import type { AppEnv } from "./context.ts";
import { fillPage, notIndexed, pageHead, type SearchEngines } from "./search-engines.ts";

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
 * The opener policy of an answer, where it is not the secure headers'
 * `same-origin` (ADR 0034). Google's and Apple's sign-in runs in a pop-up
 * on the web, which hands its answer to the page that opened it, so the two
 * must stay linked: the pop-up's pages here (the start, the callbacks, the
 * stand-in's page, then the web app's sign-in/return) have no policy, and
 * the web app's other pages let the pop-ups they open keep the link. The
 * rest of the API and the console keep `same-origin`.
 */
export function openerPolicyFor(path: string): "unsafe-none" | "same-origin-allow-popups" | null {
  if (path.startsWith("/v1/auth/oauth/") && path !== finishProviderSignInRoute.path) {
    return "unsafe-none";
  }
  if (isApiPath(path) || isConsolePath(path)) return null;
  return path === `/${providerReturnPath}` ? "unsafe-none" : "same-origin-allow-popups";
}

/** Lets serveStatic report a miss instead of running another handler. */
const reportMiss = () => Promise.resolve();

export type WebApp = (c: Context<AppEnv, string>) => Promise<Response | undefined>;

/** The exported page, or undefined when the export has none. */
async function readPage(root: string): Promise<string | undefined> {
  try {
    return await readFile(join(root, "index.html"), "utf8");
  } catch {
    return undefined;
  }
}

/**
 * Serves the exported web app (`expo export --platform web`) on the API's own
 * origin, so the refresh cookie stays first-party (ADR 0018). It answers only
 * reads that no API route took: files come from the export, and any other
 * path outside /v1 that names a screen gets the app's page, whose router
 * shows it, with its head filled for the language asked for (spec 23, 3.6).
 * Returns undefined for everything else, which gets the API's 404.
 * Running after the routes, not as a route, keeps API route names in logs.
 * Which answers search engines may index is the app's middleware's to say
 * (spec 23, R23.6; trip pages, R4.6, add a robots tag of their own too).
 */
export function createWebApp(
  root: string,
  photoOrigin: string | null = null,
  searchEngines: SearchEngines = notIndexed,
): WebApp {
  const contentSecurityPolicy = webContentSecurityPolicy(photoOrigin);
  const files = serveStatic<AppEnv>({ root });

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
    if (isFilePath(c.req.path)) {
      const file = await files(c, reportMiss);
      if (file instanceof Response) return file;
      // A missing file's 404 may not be kept as if it were a bundle.
      c.header("Cache-Control", "no-cache");
      return undefined;
    }
    // A screen, the front page too: the page with its head filled, never the
    // export's index.html as it is.
    const html = await readPage(root);
    if (html === undefined) return undefined;
    const head = pageHead(
      {
        path: c.req.path,
        lang: c.req.query("lang") ?? null,
        acceptLanguage: c.req.header("accept-language") ?? null,
      },
      searchEngines,
    );
    if (head.fromBrowser) c.header("Vary", "Accept-Language");
    return c.html(fillPage(html, head));
  };
}
