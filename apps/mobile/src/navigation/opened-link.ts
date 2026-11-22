/**
 * The path the app was opened at, for a link kept through signing in
 * (spec 20, 3.2). The phone apps open no links from outside yet, so there
 * is none; the web's is in opened-link.web.ts.
 */
export function takeOpenedPath(): string | null {
  return null;
}
