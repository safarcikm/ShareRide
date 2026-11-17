import { serveStatic } from "@hono/node-server/serve-static";
import type { Context } from "hono";
import type { AppEnv } from "./context.ts";
import { adminPrefix } from "./modules/admin/require-operator.ts";
import type { WebApp } from "./web-app.ts";

const consoleRoot = "/admin";

/** The console's pages and files, but not its API under /admin/v1. */
export const isConsolePath = (path: string) =>
  (path === consoleRoot || path.startsWith(`${consoleRoot}/`)) &&
  path !== adminPrefix &&
  !path.startsWith(`${adminPrefix}/`);

/** Vite puts content-hashed files here, so they never change. */
const isHashed = (path: string) => path.startsWith(`${consoleRoot}/assets/`);

const isFilePath = (path: string) => isHashed(path) || (path.split("/").at(-1) ?? "").includes(".");

/**
 * Stricter than the web app's (ADR 0028): the console loads only its own
 * scripts, styles, fonts and images, calls only its own API, and sends no
 * forms anywhere. Images may also come from photo storage (ADR 0022).
 */
export const consoleContentSecurityPolicy = (photoOrigin: string | null = null) =>
  [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    photoOrigin === null ? "img-src 'self'" : `img-src 'self' ${photoOrigin}`,
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");

const reportMiss = () => Promise.resolve();

/**
 * Serves the console's build (`pnpm --filter @shareride/admin build`) at
 * /admin on the API's own origin, so its session cookie stays first-party.
 * Files come from the build; any other console path gets its page, whose
 * router shows it. Returns undefined for everything else. `photoOrigin` is
 * photo storage's, where its links lead elsewhere.
 */
export function createAdminApp(root: string, photoOrigin: string | null = null): WebApp {
  const policy = consoleContentSecurityPolicy(photoOrigin);
  const rewriteRequestPath = (path: string) => path.slice(consoleRoot.length) || "/";
  const files = serveStatic<AppEnv>({ root, rewriteRequestPath });
  const page = serveStatic<AppEnv>({ root, path: "index.html" });

  return async (c: Context<AppEnv, string>) => {
    const read = c.req.method === "GET" || c.req.method === "HEAD";
    if (!read || !isConsolePath(c.req.path)) return undefined;
    c.header("Content-Security-Policy", policy);
    c.header("X-Robots-Tag", "noindex, nofollow");
    c.header(
      "Cache-Control",
      isHashed(c.req.path) ? "public, max-age=31536000, immutable" : "no-cache",
    );
    if (isFilePath(c.req.path)) {
      const file = await files(c, reportMiss);
      if (file instanceof Response) return file;
      c.header("Cache-Control", "no-cache");
      return undefined;
    }
    c.header("Cache-Control", "no-cache");
    const fallback = await page(c, reportMiss);
    return fallback instanceof Response ? fallback : undefined;
  };
}
