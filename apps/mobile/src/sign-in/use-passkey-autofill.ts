import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/auth/session";
import { devicePasskeys, type PasskeyAssertion } from "./passkey";
import { keepPasskeyOptionsMs } from "./passkey-set-up";

/** What the screen does with the quiet request. */
export interface PasskeyAutofill {
  /** Ends the quiet request at once, before the button's sheet, Google or Apple opens. */
  pause(): void;
  /** Starts it again, with new options. */
  resume(): void;
}

/**
 * Face ID in the email field (spec 28, 3.1): while `enabled` and the browser
 * can offer the site's passkeys among the email field's suggestions, asks
 * for sign-in options and hands them to the browser quietly. A passkey
 * picked there goes to `onAnswer`, and the request starts again after it.
 * New options replace the old a little before their challenge's 5 minutes
 * are up. Any failure leaves the screen as it was: nothing is shown.
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

  const on = enabled && available && !paused;
  useEffect(() => {
    if (!on) return undefined;
    let live = true;
    let waiting = false;
    let renew: ReturnType<typeof setTimeout> | undefined;
    // Read again after each wait: `stop` may have run meanwhile.
    const stopped = () => !live;

    function stop() {
      if (!live) return;
      live = false;
      clearTimeout(renew);
      // Only the quiet request: never a sheet opened since.
      if (waiting) devicePasskeys.cancel();
      waiting = false;
    }

    async function ask(): Promise<void> {
      const asked = await session.passkeyOptions();
      if (stopped() || !asked.ok) return;
      waiting = true;
      renew = setTimeout(() => {
        if (stopped()) return;
        waiting = false;
        devicePasskeys.cancel();
        void ask();
      }, keepPasskeyOptionsMs);
      let credential: PasskeyAssertion;
      try {
        credential = await devicePasskeys.autofill(asked.data.options);
      } catch {
        // Cancelled, renewed, or the browser could not: stay as it was.
        return;
      }
      if (stopped()) return;
      waiting = false;
      clearTimeout(renew);
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
