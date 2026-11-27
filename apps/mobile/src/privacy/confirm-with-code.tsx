import type { CallFailure } from "@shareride/api-client";
import { sendConfirmCodeRoute } from "@shareride/contracts";
import { codeRules, hideEmail } from "@shareride/domain";
import { RotateCw, X } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { errorText, formatWait } from "@/auth/errors";
import { useMe, useSession } from "@/auth/session";
import { useConfig } from "@/beta/config";
import { ActionRows } from "@/components/action-rows";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Row } from "@/components/row";
import { InBar } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { Body, sectionLevel } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useSecondsUntil } from "@/sign-in/use-seconds-until";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

const codeLength = codeRules.length;

/** Where a code went: the email partly hidden, or the number's last two digits. */
interface SentWhere {
  readonly channel: "email" | "sms";
  readonly to: string | null;
}

/** Failures about the code itself, which this component words. */
const codeFailures = new Set(["code_invalid", "code_expired", "code_attempts_exceeded"]);

/**
 * Confirming a sensitive action with a fresh code (spec 11, R11.1; plan
 * 4.3): a code goes as soon as this appears, by email to the account's
 * verified email, else by text message to its own number (spec 26, 3.6),
 * and the action runs once six digits are in. It says where the code went,
 * and shows "Send a new code" after the wait. Opened again inside that
 * wait, it uses the code already sent. If no code could be sent, it says
 * why and still takes a code the person already has.
 *
 * The button that confirms is the screen's one main button while this
 * shows, in its bottom bar (spec 31, R31.1): busy until the first code has
 * an answer, so the bar does not come and go. "Send a new code" and
 * "Cancel" are rows under the field, and what the code has to say stays by
 * the field it is about.
 */
export function ConfirmWithCode({
  confirmLabel,
  danger = false,
  onConfirm,
  describe,
  sentUntil,
  onSent,
  onCancel,
}: {
  /** The button that confirms, such as "Make my file". */
  readonly confirmLabel: string;
  /** What it confirms takes something away, as deleting the account does: the button is red. */
  readonly danger?: boolean;
  /** Runs the action with the code: done, or why not. */
  readonly onConfirm: (code: string) => Promise<{ readonly ok: true } | CallFailure>;
  /** Words for a failure that is the action's own, such as one file a day. */
  readonly describe?: (failure: CallFailure) => string | undefined;
  /**
   * When the wait for a new code ends (milliseconds since 1970), kept by the
   * screen: opened again before then, this sends no code.
   */
  readonly sentUntil: number;
  /** Told that time each time a code is sent. */
  readonly onSent: (until: number) => void;
  readonly onCancel: () => void;
}) {
  const { t } = useLanguage();
  const session = useSession();
  const me = useMe();
  const { emailSignIn } = useConfig();
  const palette = usePalette();
  // A code sent a moment ago, when the form was open before, is used again.
  const [reuse] = useState(() => Date.now() < sentUntil);
  // A code went: the person can type it.
  const [sent, setSent] = useState(reuse);
  // The first request has an answer, whatever it was.
  const [asked, setAsked] = useState(reuse);
  const [resendAt, setResendAt] = useState(reuse ? sentUntil : 0);
  // Where the API says the code went; for a code sent before, where it goes now.
  const [sentWhere, setSentWhere] = useState<SentWhere | null>(null);
  const secondsLeft = useSecondsUntil(resendAt);
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string>();
  // Worded when shown, so a change of language changes it too.
  const [notice, setNotice] = useState<CodeNotice | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(!reuse);
  // Guards against a second tap or a Return key before the first reply.
  const inFlight = useRef(false);
  const mounted = useRef(true);

  // The first code is asked for once, even if React runs the effect twice,
  // and not at all when the one sent a moment ago is used.
  const started = useRef(reuse);

  /** Asks for a code; what it sets comes after the reply. */
  const request = useCallback(
    async (again: boolean) => {
      const result = await session.call(sendConfirmCodeRoute, { body: {} });
      if (!mounted.current) return;
      inFlight.current = false;
      setSending(false);
      setAsked(true);
      if (result.ok) {
        const until = Date.now() + result.data.resendAfterSeconds * 1000;
        setSentWhere({ channel: result.data.channel, to: result.data.sentTo });
        setSent(true);
        setResendAt(until);
        onSent(until);
        if (again) setNotice({ kind: "resent" });
        return;
      }
      setNotice({ kind: "failed", failure: result });
      const wait = result.error.retryAfterSeconds;
      if (wait !== undefined) setResendAt(Date.now() + wait * 1000);
    },
    [session, onSent],
  );

  // The first code goes as soon as this appears.
  useEffect(() => {
    mounted.current = true;
    if (!started.current) {
      started.current = true;
      inFlight.current = true;
      void request(false);
    }
    return () => {
      mounted.current = false;
    };
  }, [request]);

  function resend() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setNotice(null);
    void request(true);
  }

  async function confirm(entered: string) {
    if (inFlight.current) return;
    if (entered.length !== codeLength) {
      setFieldError(t("auth.code.incomplete", { length: codeLength }));
      return;
    }
    inFlight.current = true;
    setConfirming(true);
    setNotice(null);
    const result = await onConfirm(entered);
    // Done: the screen shows what happened next in place of this.
    if (result.ok || !mounted.current) return;
    inFlight.current = false;
    setConfirming(false);
    setCode("");
    setNotice({ kind: "failed", failure: result });
    const wait = result.error.retryAfterSeconds;
    if (result.error.code === "code_attempts_exceeded" && wait !== undefined) {
      setResendAt(Date.now() + wait * 1000);
    }
  }

  let message: string | null = null;
  if (notice?.kind === "resent") message = t("auth.code.resent");
  if (notice?.kind === "failed") {
    const { failure } = notice;
    const own = codeFailures.has(failure.error.code) ? undefined : describe?.(failure);
    message = own ?? errorText(t, failure);
  }

  // A code sent before this opened goes where codes go: the verified email,
  // if any, on a server that sends email.
  const where: SentWhere =
    sentWhere ??
    (me === null || me.email === null || !emailSignIn
      ? { channel: "sms", to: me?.phoneNumber?.slice(-2) ?? null }
      : { channel: "email", to: hideEmail(me.email) });
  // Until the first answer, sending; then where it went, or nothing if it
  // could not go (the notice says why).
  let sentTo: string | null = asked ? null : t("confirm.sending");
  if (sent) {
    if (where.channel === "email") sentTo = t("confirm.sentToEmail", { email: where.to ?? "" });
    else
      sentTo =
        where.to === null ? t("confirm.sentNoNumber") : t("confirm.sent", { digits: where.to });
  }

  return (
    <View style={styles.group}>
      <Text
        accessibilityRole="header"
        {...sectionLevel}
        style={[typography.label, { color: palette.text }]}
      >
        {t("confirm.title")}
      </Text>
      {sentTo === null ? null : <Body align="start">{sentTo}</Body>}
      {asked ? (
        <TextField
          label={t("auth.code.label", { length: codeLength })}
          value={code}
          onChangeText={(typed) => {
            const entered = typed.replace(/\D/g, "").slice(0, codeLength);
            setCode(entered);
            setFieldError(undefined);
            if (entered.length === codeLength) void confirm(entered);
          }}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={codeLength}
          error={fieldError}
          autoFocus
        />
      ) : null}
      <Notice message={message} kind={notice?.kind === "resent" ? "info" : "error"} />
      {asked && secondsLeft > 0 ? (
        <Body align="start">{t("auth.code.resendIn", { wait: formatWait(t, secondsLeft) })}</Body>
      ) : null}
      <ActionRows>
        {asked && secondsLeft <= 0 ? (
          <Row
            icon={RotateCw}
            title={t("auth.code.resend")}
            disabled={sending || confirming}
            onPress={resend}
          />
        ) : null}
        <Row icon={X} title={t("common.cancel")} onPress={onCancel} />
      </ActionRows>
      <InBar>
        <Button
          main
          variant={danger ? "danger" : "primary"}
          label={confirmLabel}
          busy={confirming || !asked}
          onPress={() => void confirm(code)}
        />
      </InBar>
    </View>
  );
}

type CodeNotice =
  { readonly kind: "resent" } | { readonly kind: "failed"; readonly failure: CallFailure };

const styles = StyleSheet.create({ group: { gap: spacing.md, marginTop: spacing.md } });
