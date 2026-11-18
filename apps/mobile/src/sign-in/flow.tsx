import type { SupportedCountry } from "@shareride/domain";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useKeptRide, type KeptRide } from "./kept-ride";

/**
 * What the sign-in screens share: the number as typed, its country, the
 * number a code was sent to, and the ride kept through signing in. Kept in
 * memory, never in the address bar, so the number does not end up in
 * browser history.
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
  /** Looked at once for both steps; undefined while it loads. */
  readonly keptRide: KeptRide | undefined;
  /**
   * The invite code, as typed or from an invite link, kept through the
   * steps: sent with the text-message code, and ignored for a member.
   */
  readonly inviteCode: string;
  readonly setInviteCode: (inviteCode: string) => void;
  /**
   * The text-message code that was right for a number with no account,
   * kept while the app asks for the invite code (spec 12, 3.2.3).
   */
  readonly rightCode: string | null;
  readonly setRightCode: (code: string | null) => void;
  /** Said once on step 1, such as why the person is back there. */
  readonly notice: string | null;
  readonly setNotice: (notice: string | null) => void;
}

const SignInFlowContext = createContext<SignInFlow | null>(null);

export function SignInFlowProvider({
  children,
  inviteCode: fromLink = "",
}: {
  readonly children: ReactNode;
  /** The code of an invite link. */
  readonly inviteCode?: string;
}) {
  const [country, setCountry] = useState<SupportedCountry>("IS");
  const [typed, setTyped] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [inviteCode, setInviteCode] = useState(fromLink);
  const [rightCode, setRightCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const keptRide = useKeptRide();
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
      keptRide,
      inviteCode,
      setInviteCode,
      rightCode,
      setRightCode,
      notice,
      setNotice,
    }),
    [country, typed, sentTo, resendAt, keptRide, inviteCode, rightCode, notice],
  );
  return <SignInFlowContext value={value}>{children}</SignInFlowContext>;
}

export function useSignInFlow(): SignInFlow {
  const flow = useContext(SignInFlowContext);
  if (flow === null) throw new Error("useSignInFlow must be used inside SignInFlowProvider");
  return flow;
}
