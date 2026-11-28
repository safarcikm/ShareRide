import { onWebsite } from "@/lib/on-website";

/**
 * The browser's user agent on the website, which says whether it runs on
 * an iPhone or an Android phone (spec 35, 3.4); null in the phone apps.
 */
export function browserUserAgent(): string | null {
  if (!onWebsite()) return null;
  const agent: unknown = (globalThis as { navigator?: { userAgent?: unknown } }).navigator
    ?.userAgent;
  return typeof agent === "string" ? agent : null;
}
