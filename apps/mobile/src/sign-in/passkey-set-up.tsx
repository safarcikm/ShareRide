import type { CallFailure } from "@shareride/api-client";
import { memberPasskeyRules } from "@shareride/domain";
import type { Translate } from "@shareride/i18n";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { ConfirmWithCode } from "@/privacy/confirm-with-code";
import { spacing } from "@/theme/tokens";
import type { PasskeyOptions } from "./passkey";
import { passkeySetUpOptions, savePasskey, type SetUpOutcome } from "./use-passkeys";

/**
 * How long options whose sheet was closed are used again: a little short of
 * their challenge's 5 minutes, for the trip to the API.
 */
export const keepPasskeyOptionsMs = (memberPasskeyRules.challengeSeconds - 30) * 1000;

/** What an outcome other than saved or cancelled says. */
export function setUpOutcomeText(t: Translate, outcome: SetUpOutcome): string {
  switch (outcome.kind) {
    case "saved":
      return t("passkey.saved");
    case "already":
      return t("passkey.already");
    case "too_many":
      return t("passkey.tooMany", { max: memberPasskeyRules.perAccount });
    case "refused":
      return errorText(t, outcome.failure);
    case "cancelled":
    case "failed":
      return t("passkey.failed");
  }
}

/**
 * Sets up Face ID or fingerprint on this device (spec 27, 3.6, item 2, and
 * 3.7): the API's options, then the device's own sheet, then the passkey
 * saved. A sign-in over 10 minutes old asks for a confirm code first
 * (R27.5), in place of the button. Options the API gave are kept while their
 * challenge lasts, so closing the sheet and pressing again asks for no new
 * code; a browser that wants the sheet opened by a tap gets one that way.
 * Closing the sheet changes nothing; every other outcome goes to the screen.
 */
export function PasskeySetUp({
  label,
  variant = "secondary",
  disabled = false,
  onBusy,
  onOutcome,
}: {
  readonly label: string;
  readonly variant?: "primary" | "secondary";
  readonly disabled?: boolean;
  /** Told while the API or the device's sheet is at work, so the screen can hold its other buttons. */
  readonly onBusy?: (busy: boolean) => void;
  /** Saved, or why not; never cancelled. */
  readonly onOutcome: (outcome: Exclude<SetUpOutcome, { kind: "cancelled" }>) => void;
}) {
  const { t } = useLanguage();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // When a new confirm code can be asked for, kept while the form closes and opens.
  const [sentUntil, setSentUntil] = useState(0);
  const kept = useRef<{ readonly options: PasskeyOptions; readonly until: number } | null>(null);
  // Guards against a second tap before the first is done.
  const working = useRef(false);
  useEffect(() => {
    onBusy?.(busy);
  }, [busy, onBusy]);

  /** The device's sheet, then the passkey saved; the options stay if it was closed. */
  async function save(options: PasskeyOptions) {
    const outcome = await savePasskey(session, options);
    if (outcome.kind === "cancelled") return;
    kept.current = null;
    onOutcome(outcome);
  }

  async function start() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      const before = kept.current;
      if (before !== null && Date.now() < before.until) {
        await save(before.options);
        return;
      }
      const asked = await passkeySetUpOptions(session);
      if (asked.kind === "confirm_required") {
        setConfirming(true);
        return;
      }
      if (asked.kind !== "options") {
        onOutcome(asked);
        return;
      }
      kept.current = { options: asked.options, until: Date.now() + keepPasskeyOptionsMs };
      await save(asked.options);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  /** The code is the proof: then the sheet at once. A wrong code stays in the form. */
  async function confirm(code: string): Promise<{ readonly ok: true } | CallFailure> {
    const asked = await passkeySetUpOptions(session, code);
    if (asked.kind === "refused") return asked.failure;
    setConfirming(false);
    // The code is used up: the next one is sent at once.
    setSentUntil(0);
    if (asked.kind === "options") {
      kept.current = { options: asked.options, until: Date.now() + keepPasskeyOptionsMs };
      working.current = true;
      setBusy(true);
      try {
        await save(asked.options);
      } finally {
        working.current = false;
        setBusy(false);
      }
    } else if (asked.kind === "too_many") {
      onOutcome(asked);
    }
    return { ok: true };
  }

  if (confirming) {
    // The code field takes focus itself, as in Download my data.
    return (
      <View style={styles.form}>
        <Body align="start">{t("passkey.confirm")}</Body>
        <ConfirmWithCode
          confirmLabel={label}
          onConfirm={confirm}
          sentUntil={sentUntil}
          onSent={setSentUntil}
          onCancel={() => {
            setConfirming(false);
          }}
        />
      </View>
    );
  }
  return (
    <Button
      variant={variant}
      label={label}
      busy={busy}
      disabled={disabled}
      onPress={() => void start()}
    />
  );
}

const styles = StyleSheet.create({ form: { gap: spacing.md, alignSelf: "stretch" } });
