// A stand-in for the browser's page, for Google's tag in screen tests (spec
// 23). Each test file mocks the host module with it (jest.mock calls must
// stay in the test file):
//
//   jest.mock("@/analytics/host", () => jest.requireActual("@/testing/analytics-host").mockHostModule);
import type { AnalyticsHost } from "@/analytics/google-tag";

export interface FakeAnalyticsHost extends AnalyticsHost {
  readonly scripts: string[];
  readonly cookies: Set<string>;
  /** How many times the page was loaded again. */
  readonly reloads: () => number;
  /** As when another tab changes what this site keeps in the browser. */
  changeInAnotherTab(key: string): void;
  /** The commands given to Google's tag, each as the list of its arguments. */
  commands(): unknown[][];
  /** The patterns of the page views sent, in order. */
  pageViews(): string[];
}

export function createFakeAnalyticsHost(): FakeAnalyticsHost {
  const globals: Record<string, unknown> = {};
  const scripts: string[] = [];
  const cookies = new Set<string>();
  let reloads = 0;
  const listeners = new Map<string, Set<() => void>>();
  const commands = () =>
    ((globals["dataLayer"] ?? []) as IArguments[]).map((entry) => [...entry] as unknown[]);
  return {
    origin: "https://puffinride.is",
    referrer: "",
    search: "",
    globals,
    scripts,
    cookies,
    addScript: (src) => {
      scripts.push(src);
    },
    cookieNames: () => [...cookies],
    removeCookie: (name) => {
      cookies.delete(name);
    },
    reload: () => {
      reloads += 1;
    },
    reloads: () => reloads,
    onStorage: (key, listener) => {
      const forKey = listeners.get(key) ?? new Set();
      forKey.add(listener);
      listeners.set(key, forKey);
      return () => forKey.delete(listener);
    },
    changeInAnotherTab: (key) => {
      for (const listener of listeners.get(key) ?? []) listener();
    },
    commands,
    pageViews: () =>
      commands()
        .filter((command) => command[0] === "event" && command[1] === "page_view")
        .map((command) => (command[2] as { page_title: string }).page_title),
  };
}

let current: AnalyticsHost | null = null;

/** Sets the page the app sees: a fake browser, or null as in the phone apps. */
export function setAnalyticsHost(host: AnalyticsHost | null): void {
  current = host;
}

/** Stands in for `@/analytics/host`. */
export const mockHostModule = {
  get analyticsHost() {
    return current;
  },
};
