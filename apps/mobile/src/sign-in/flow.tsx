import type { SupportedCountry } from "@shareride/domain";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * What the sign-in screens share: the number as typed, its country, and the
 * number a code was sent to. Kept in memory, never in the address bar, so
 * the number does not end up in browser history.
 */
export interface SignInFlow {
  readonly country: SupportedCountry;
  readonly setCountry: (country: SupportedCountry) => void;
  readonly typed: string;
  readonly setTyped: (typed: string) => void;
  /** E.164; null until a code has been sent. */
  readonly sentTo: string | null;
  /** When a new code can be asked for, as a time in milliseconds. */
  readonly resendAt: number;
  readonly codeSent: (phoneNumber: string, resendAfterSeconds: number) => void;
  /** After a wait the API asked for, such as too many wrong codes. */
  readonly waitBeforeResend: (seconds: number) => void;
}

const SignInFlowContext = createContext<SignInFlow | null>(null);

export function SignInFlowProvider({ children }: { readonly children: ReactNode }) {
  const [country, setCountry] = useState<SupportedCountry>("IS");
  const [typed, setTyped] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const value = useMemo<SignInFlow>(
    () => ({
      country,
      setCountry,
      typed,
      setTyped,
      sentTo,
      resendAt,
      codeSent: (phoneNumber, resendAfterSeconds) => {
        setSentTo(phoneNumber);
        setResendAt(Date.now() + resendAfterSeconds * 1000);
      },
      waitBeforeResend: (seconds) => {
        setResendAt(Date.now() + seconds * 1000);
      },
    }),
    [country, typed, sentTo, resendAt],
  );
  return <SignInFlowContext value={value}>{children}</SignInFlowContext>;
}

export function useSignInFlow(): SignInFlow {
  const flow = useContext(SignInFlowContext);
  if (flow === null) throw new Error("useSignInFlow must be used inside SignInFlowProvider");
  return flow;
}
