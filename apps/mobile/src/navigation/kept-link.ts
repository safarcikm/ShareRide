import { readAppData, writeAppData } from "@/lib/app-data";
import { accountScreens, memberScreens } from "./member-screens";

// A link to a screen that needs an account, opened before signing in, as
// from an email (spec 20, 3.2): kept on the device while the person signs
// in or up, so that screen opens afterwards. Only the path, such as
// /bookings/<id>/rate, and the time, in the app's own storage.

const key = "pending-link";

/** Signing in takes a few minutes; a link kept longer ago is forgotten. */
const lifetimeMs = 60 * 60 * 1000;

/** A screen's name as a pattern for its paths: "[id]" is one segment, "index" none. */
function patternOf(name: string): RegExp {
  const segments = name
    .split("/")
    .filter((segment, at, all) => !(segment === "index" && at === all.length - 1))
    .map((segment) => (/^\[\w+\]$/.test(segment) ? "[A-Za-z0-9_-]+" : segment));
  return new RegExp(`^/${segments.join("/")}$`);
}

const patterns = [...memberScreens, ...accountScreens].map(patternOf);

/** The path, if it is one of the app's screens that need an account; never anything else. */
export function linkNeedingAccount(path: string | null | undefined): string | null {
  if (typeof path !== "string") return null;
  return patterns.some((pattern) => pattern.test(path)) ? path : null;
}

/** Keeps the link for an hour, if it needs an account; anything else is not kept. */
export async function keepPendingLink(path: string, at: Date): Promise<void> {
  const link = linkNeedingAccount(path);
  if (link === null) return;
  await writeAppData(key, JSON.stringify({ path: link, keptAt: at.toISOString() }));
}

/**
 * As `keepPendingLink`, unless a link kept within the hour waits already,
 * which goes first: for a screen worth offering, but not instead of one
 * the person opened.
 */
export async function keepPendingLinkIfNone(path: string, at: Date): Promise<void> {
  if (keptWithin((await readAppData(key)) ?? "", at) !== null) return;
  await keepPendingLink(path, at);
}

/** Forgets the kept link if it is `path`; another one stays. */
export async function forgetPendingLink(path: string): Promise<void> {
  const stored = await readAppData(key);
  if (stored === null || stored === "") return;
  let kept: unknown;
  try {
    kept = JSON.parse(stored);
  } catch {
    return;
  }
  if (typeof kept === "object" && kept !== null && (kept as { path?: unknown }).path === path) {
    await writeAppData(key, "");
  }
}

/** The link kept within the last hour, once: taking it forgets it. */
export async function takePendingLink(at: Date): Promise<string | null> {
  const stored = await readAppData(key);
  if (stored === null || stored === "") return null;
  await writeAppData(key, "");
  return keptWithin(stored, at);
}

/** The stored link, if it was kept within the last hour and needs an account. */
function keptWithin(stored: string, at: Date): string | null {
  if (stored === "") return null;
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { path, keptAt } = value as Record<string, unknown>;
  const age = typeof keptAt === "string" ? at.getTime() - Date.parse(keptAt) : Number.NaN;
  if (!(age >= 0 && age <= lifetimeMs)) return null;
  return linkNeedingAccount(typeof path === "string" ? path : null);
}
