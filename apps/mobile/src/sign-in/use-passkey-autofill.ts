import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/auth/session";
import {
  devicePasskeys,
  keepPasskeyOptionsMs,
  type PasskeyAssertion,
  type PasskeyOptions,
} from "./passkey";

/** What the screen does with the quiet request. */
export interface PasskeyAutofill {
  /**
   * Ends the quiet request at once, before the button's sheet, Google or
   * Apple opens, until `resume` or until the screen is left and shown again.
   */
  pause(): void;
  /** Starts it again, with new options. */
  resume(): void;
}

/** After options could not be had, as with no network: ask again this much later. */
export const autofillRetryMs = 30_000;
/**
 * A quiet request the browser ended itself after at least this long, as
 * when the person picked the passkey and then cancelled Face ID, starts
 * again; one refused sooner is a browser that cannot, so it waits for new
 * options.
 */
const endedByPersonMs = 1_000;

/**
 * Face ID in the email field (spec 28, 3.1): while `enabled` and the browser
 * can offer the site's passkeys among the email field's suggestions, asks
 * for sign-in options and hands them to the browser quietly. A passkey
 * picked there goes to `onAnswer`, and the request starts again after a
 * refused one. New options replace the old a little before their
 * challenge's 5 minutes are up. Any failure leaves the screen as it was:
 * nothing is shown.
 */
export function usePasskeyAutofill({
  enabled,
  onAnswer,
}: {
  readonly enabled: boolean;
  /** Signs in with the answer; true when signed in, so the request does not start again. */
  readonly onAnswer: (credential: PasskeyAssertion) => Promise<boolean>;
}): PasskeyAutofill {
  const session = useSession();
  const [available, setAvailable] = useState(false);
  const [paused, setPaused] = useState(false);
  // Each resume starts a new request, even one in the same render as its pause.
  const [run, setRun] = useState(0);
  const answer = useRef(onAnswer);
  useEffect(() => {
    answer.current = onAnswer;
  });
  // Ends the request that is running now; set while one runs.
  const stopRunning = useRef<(() => void) | null>(null);

  useEffect(() => {
    let live = true;
    void devicePasskeys.autofillAvailable().then((can) => {
      if (live) setAvailable(can);
    });
    return () => {
      live = false;
    };
  }, []);

  // A pause lasts while the screen stays: back on it, as from the code's, it waits again.
  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (enabled !== wasEnabled) {
    setWasEnabled(enabled);
    if (!enabled) setPaused(false);
  }

  const on = enabled && available && !paused;
  useEffect(() => {
    if (!on) return undefined;
    let live = true;
    // The newest request's number: an older one's answer or refusal is stale.
    let turn = 0;
    let waiting = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Read again after each wait: `stop` may have run meanwhile.
    const stopped = () => !live;

    function askIn(ms: number) {
      clearTimeout(timer);
      timer = setTimeout(() => void ask(), ms);
    }

    function stop() {
      if (!live) return;
      live = false;
      clearTimeout(timer);
      // Only the quiet request: never a sheet opened since.
      if (waiting) devicePasskeys.cancel();
      waiting = false;
    }

    /** New options, then a quiet request with them, which ends the one before. */
    async function ask(): Promise<void> {
      const asked = await session.passkeyOptions();
      if (stopped()) return;
      if (!asked.ok) {
        askIn(autofillRetryMs);
        return;
      }
      void listen(asked.data.options, Date.now() + keepPasskeyOptionsMs);
    }

    async function listen(options: PasskeyOptions, until: number): Promise<void> {
      turn += 1;
      const mine = turn;
      const since = Date.now();
      waiting = true;
      askIn(until - since);
      let credential: PasskeyAssertion;
      try {
        credential = await devicePasskeys.autofill(options);
      } catch {
        // Stopped here, or replaced by newer options: nothing to do.
        if (stopped() || mine !== turn) return;
        waiting = false;
        // Ended by the browser, as when Face ID was cancelled: the same
        // options again, their challenge unused. Refused at once, the
        // browser cannot; the new options in a while try again.
        if (Date.now() - since >= endedByPersonMs) void listen(options, until);
        return;
      }
      if (stopped() || mine !== turn) return;
      waiting = false;
      clearTimeout(timer);
      const signedIn = await answer.current(credential);
      // Refused: the field offers its passkeys again.
      if (!stopped() && !signedIn) void ask();
    }

    void ask();
    stopRunning.current = stop;
    return () => {
      stop();
      if (stopRunning.current === stop) stopRunning.current = null;
    };
  }, [on, run, session]);

  const pause = useCallback(() => {
    stopRunning.current?.();
    setPaused(true);
  }, []);
  const resume = useCallback(() => {
    setPaused(false);
    setRun((runs) => runs + 1);
  }, []);
  return useMemo(() => ({ pause, resume }), [pause, resume]);
}
