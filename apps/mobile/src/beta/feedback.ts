import { router, useSegments } from "expo-router";
import { useCallback, useRef } from "react";
import { takeScreenshot } from "./screenshot";

// Opening "Send feedback" (spec 12, 3.3.1): the screen's name and, on
// phones, its picture are taken first, of the screen the person is on, and
// handed to the form.

export interface FeedbackStart {
  /** The screen's route, such as `/trips/[id]`: never an address with an ID in it. */
  readonly screen: string;
  /** A JPEG in base64, or null: on the web, or when none could be taken. */
  readonly screenshot: string | null;
}

let waiting: FeedbackStart | null = null;

/** What the form starts from, once: the screen the person came from. */
export function takeFeedbackStart(): FeedbackStart {
  const start = waiting ?? { screen: "/", screenshot: null };
  waiting = null;
  return start;
}

/** A screen's route from its segments, without the groups: `/trips/[id]`. */
export function screenName(segments: readonly string[]): string {
  const parts = segments.filter((segment) => !/^\(.*\)$/.test(segment));
  return `/${parts.join("/")}`;
}

export const feedbackPath = "/feedback";

/** Opens the form from the screen on show; a second call while it opens does nothing. */
export function useOpenFeedback(): () => void {
  const segments = useSegments();
  const opening = useRef(false);
  return useCallback(() => {
    const screen = screenName(segments);
    // From the form itself, or while it opens: nothing more to open.
    if (opening.current || screen === feedbackPath) return;
    opening.current = true;
    void takeScreenshot()
      .catch(() => null)
      .then((screenshot) => {
        waiting = { screen, screenshot };
        opening.current = false;
        router.push(feedbackPath);
      });
  }, [segments]);
}
