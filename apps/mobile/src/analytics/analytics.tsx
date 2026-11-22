import { usePathname, useSegments } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useConfig } from "@/beta/config";
import { now } from "@/lib/clock";
import { consentKey, readChoice, saveChoice, type ConsentChoice } from "./consent";
import { removeGoogleCookies, startGoogleTag, type GoogleTag } from "./google-tag";
import { analyticsHost } from "./host";
import { screenPattern } from "./screen-pattern";

interface Analytics {
  /** Whether this site counts visits: the website, with a measurement ID (spec 23, 3.1). */
  readonly available: boolean;
  /** The choice kept; null before one is made; undefined while it is read. */
  readonly choice: ConsentChoice | null | undefined;
  /** Accept or Decline, from the bar or the Cookies page; kept in this browser. */
  readonly choose: (choice: ConsentChoice) => void;
}

const AnalyticsContext = createContext<Analytics>({
  available: false,
  choice: null,
  choose: () => undefined,
});

/**
 * Google Analytics on the website, only after the visitor accepts (spec 23,
 * R23.1): nothing from Google loads before. Accepted, it loads Google's tag
 * and counts each screen opened, by its pattern (R23.3). Declined, or turned
 * off later, it stops at once and Google's cookies are removed (R23.4).
 * Turned off here, the page loads again, so nothing of the tag is left
 * running; turned off in another tab, it stops here too.
 */
export function AnalyticsProvider({ children }: { readonly children: ReactNode }) {
  const host = analyticsHost;
  const config = useConfig();
  const id = host === null ? null : (config.analytics?.googleMeasurementId ?? null);
  const [choice, setChoice] = useState<ConsentChoice | null | undefined>(undefined);
  const tag = useRef<GoogleTag | null>(null);
  // Whether the visitor turned it off in this tab, rather than another.
  const declinedHere = useRef(false);
  const pattern = screenPattern(useSegments());
  // Each screen opened counts, though only its pattern is sent: a second
  // trip's page is a second page view.
  const pathname = usePathname();

  useEffect(() => {
    let current = true;
    const read = () => {
      void readChoice(now()).then((kept) => {
        if (current) setChoice(kept);
      });
    };
    read();
    const stopWatching = host?.onStorage(consentKey, read);
    return () => {
      current = false;
      stopWatching?.();
    };
  }, [host]);

  useEffect(() => {
    if (host === null) return;
    const counting = tag.current;
    if (id !== null && choice === "accepted" && counting === null) {
      tag.current = startGoogleTag(host, id);
    } else if (counting !== null && (id === null || choice !== "accepted")) {
      // Declined, or the site no longer has Google Analytics.
      counting.stop();
      tag.current = null;
      if (declinedHere.current) host.reload();
    } else if (id !== null && choice === "declined") {
      removeGoogleCookies(host);
    }
  }, [host, id, choice]);

  // After the tag starts, so accepting counts the screen open now.
  useEffect(() => {
    if (id !== null && choice === "accepted") tag.current?.pageView(pattern);
  }, [pattern, pathname, id, choice]);

  const choose = useCallback((made: ConsentChoice) => {
    declinedHere.current = made === "declined";
    setChoice(made);
    void saveChoice(made, now());
  }, []);
  const value = useMemo(() => ({ available: id !== null, choice, choose }), [id, choice, choose]);
  return <AnalyticsContext value={value}>{children}</AnalyticsContext>;
}

export function useAnalytics(): Analytics {
  return useContext(AnalyticsContext);
}
