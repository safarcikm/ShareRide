import { cookieRemovals, type AnalyticsHost } from "./google-tag";

/** The browser's page, for Google's tag (spec 23, 3.3). */
export const analyticsHost: AnalyticsHost | null = {
  get origin() {
    return globalThis.location.origin;
  },
  get referrer() {
    return document.referrer;
  },
  // The address the page was opened at; the router changes it afterwards,
  // and only the first screen uses it.
  search: globalThis.location.search,
  globals: globalThis as unknown as Record<string, unknown>,
  addScript(src) {
    const script = document.createElement("script");
    script.async = true;
    script.src = src;
    document.head.appendChild(script);
  },
  cookieNames() {
    return document.cookie
      .split(";")
      .map((part) => part.split("=")[0]?.trim() ?? "")
      .filter((name) => name !== "");
  },
  removeCookie(name) {
    for (const removal of cookieRemovals(name, globalThis.location.hostname)) {
      document.cookie = removal;
    }
  },
  reload() {
    globalThis.location.reload();
  },
  onStorage(key, listener) {
    const changed = (event: StorageEvent) => {
      if (event.key === key || event.key === null) listener();
    };
    globalThis.addEventListener("storage", changed);
    return () => {
      globalThis.removeEventListener("storage", changed);
    };
  },
};
