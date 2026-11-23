import type { PhoneNeeded } from "@shareride/contracts";
import type { SupportedCountry } from "@shareride/domain";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useKeptRide, type KeptRide } from "./kept-ride";

/**
 * What the sign-in screens share: the email and the number as typed, the
 * number's country, where codes were sent, and the ride kept through
 * signing in. Kept in memory, never in the address bar, so neither ends up
 * in browser history.
 */
export interface SignInFlow {
  /** The email as typed on step 1 (spec 26, 3.1). */
  readonly email: string;
  readonly setEmail: (email: string) => void;
  /** The address an email code was sent to; null until one was. */
  readonly emailSentTo: string | null;
  /** When a new email code can be asked for, as a time in milliseconds. */
  readonly emailResendAt: number;
  readonly emailCodeSent: (email: string, resendAfterSeconds: number) => void;
  /** After a wait the API asked for, such as too many wrong email codes. */
  readonly waitBeforeEmailResend: (seconds: number) => void;
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
  /**
   * An email, Google or Apple sign-in waiting for the phone step (spec 19,
   * 3.3; spec 26, 3.3): set only from the answer that proved the email or
   * the account, never from an address or a link, and sent with the text
   * and its code. The phone step needs one.
   */
  readonly pending: PhoneNeeded | null;
  readonly setPending: (pending: PhoneNeeded | null) => void;
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
  const [email, setEmail] = useState("");
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null);
  const [emailResendAt, setEmailResendAt] = useState(0);
  const [country, setCountry] = useState<SupportedCountry>("IS");
  const [typed, setTyped] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [inviteCode, setInviteCode] = useState(fromLink);
  const [rightCode, setRightCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<PhoneNeeded | null>(null);
  const keptRide = useKeptRide();
  const value = useMemo<SignInFlow>(
    () => ({
      email,
      setEmail,
      emailSentTo,
      emailResendAt,
      emailCodeSent: (address, resendAfterSeconds) => {
        setEmailSentTo(address);
        setEmailResendAt(Date.now() + resendAfterSeconds * 1000);
      },
      waitBeforeEmailResend: (seconds) => {
        setEmailResendAt(Date.now() + seconds * 1000);
      },
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
      pending,
      setPending,
    }),
    [
      email,
      emailSentTo,
      emailResendAt,
      country,
      typed,
      sentTo,
      resendAt,
      keptRide,
      inviteCode,
      rightCode,
      notice,
      pending,
    ],
  );
  return <SignInFlowContext value={value}>{children}</SignInFlowContext>;
}

export function useSignInFlow(): SignInFlow {
  const flow = useContext(SignInFlowContext);
  if (flow === null) throw new Error("useSignInFlow must be used inside SignInFlowProvider");
  return flow;
}
