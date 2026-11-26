import { removePasskeyRoute, type MemberPasskey } from "@shareride/contracts";
import { memberPasskeyRules } from "@shareride/domain";
import { formatDate, type Translate } from "@shareride/i18n";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { TakesFocus } from "@/components/takes-focus";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { devicePasskeys } from "./passkey";
import { PasskeySetUp, setUpOutcomeText } from "./passkey-set-up";
import { forgetPasskeyHere } from "./this-browser";
import { usePasskeysOffered } from "./use-passkeys";

/** A device's name, such as "Safari on iPhone", from what its browser said. */
export function passkeyName(t: Translate, passkey: Pick<MemberPasskey, "browser" | "system">) {
  const { browser, system } = passkey;
  if (browser !== null && system !== null) return t("passkey.device", { browser, system });
  return browser ?? system ?? t("passkey.unknownDevice");
}

/**
 * Face ID or fingerprint in Settings, Sign-in methods (spec 27, 3.6): one
 * line per device, with when it was added and last used, and Remove, which
 * asks first, and tells this browser to forget it (spec 29, 3.4); "Not
 * set up" without one. "Set up on this device" shows where
 * the device has its own lock, until 10 devices are set up (R27.8). Where it
 * has none, as in the phone apps for now, the section shows only devices set
 * up elsewhere, so they can be removed, and is left out without any.
 */
export function PasskeyDevices({
  passkeys,
  onSaved,
  onRemoved,
  onChanged,
  tell,
  clearOutcome,
}: {
  readonly passkeys: readonly MemberPasskey[];
  readonly onSaved: (passkey: MemberPasskey) => void;
  readonly onRemoved: (id: string) => void;
  /** Something changed elsewhere, such as a device added meanwhile: load the list again. */
  readonly onChanged: () => void;
  readonly tell: (text: string, failed: boolean) => void;
  readonly clearOutcome: () => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const offered = usePasskeysOffered();
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // The question that just closed: its Remove takes focus back.
  const [closed, setClosed] = useState<string | null>(null);
  // Set up again from scratch after a removal: options kept before may name it.
  const [setUpKey, setSetUpKey] = useState(0);

  async function remove(passkey: MemberPasskey) {
    setBusy(passkey.id);
    const result = await session.call(removePasskeyRoute, { params: { id: passkey.id } });
    setBusy(null);
    setAsking(null);
    if (result.ok || result.error.code === "not_found") {
      // This browser stops offering it, if it keeps it (spec 29, 3.4), and
      // is no longer known to have one if it was this one (3.2, item 5).
      void devicePasskeys.forget(passkey.credentialId);
      void forgetPasskeyHere(passkey.credentialId);
      setSetUpKey((key) => key + 1);
      onRemoved(passkey.id);
      tell(t("passkey.removed", { device: passkeyName(t, passkey) }), false);
      return;
    }
    tell(errorText(t, result), true);
  }

  // Iceland keeps UTC all year, so the moment's date is Iceland's.
  const date = (moment: string) => formatDate(moment.slice(0, 10), locale);
  const small = [typography.small, { color: palette.textMuted }];
  const full = passkeys.length >= memberPasskeyRules.perAccount;
  if (!offered && passkeys.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={[typography.bodyStrong, { color: palette.text }]}>{t("auth.passkey")}</Text>
      {passkeys.length === 0 ? <Body align="start">{t("passkey.notSetUp")}</Body> : null}
      {passkeys.map((passkey) => {
        const device = passkeyName(t, passkey);
        return (
          <View key={passkey.id} style={styles.device}>
            <Body align="start">{device}</Body>
            <Text style={small}>{t("passkey.added", { date: date(passkey.createdAt) })}</Text>
            <Text style={small}>
              {passkey.lastUsedAt === null
                ? t("passkey.neverUsed")
                : t("passkey.lastUsed", { date: date(passkey.lastUsedAt) })}
            </Text>
            {asking === passkey.id ? (
              <TakesFocus>
                <View style={styles.question}>
                  <Body align="start">{t("passkey.removeQuestion", { device })}</Body>
                  <Button
                    label={t("passkey.remove")}
                    busy={busy === passkey.id}
                    onPress={() => void remove(passkey)}
                  />
                  <Button
                    variant="text"
                    label={t("common.cancel")}
                    disabled={busy === passkey.id}
                    onPress={() => {
                      setAsking(null);
                      setClosed(passkey.id);
                    }}
                  />
                </View>
              </TakesFocus>
            ) : (
              <TakesFocus when={closed === passkey.id}>
                <Button
                  variant="secondary"
                  label={t("passkey.remove")}
                  accessibilityLabel={t("passkey.removeLabel", { device })}
                  disabled={busy !== null}
                  onPress={() => {
                    clearOutcome();
                    setClosed(null);
                    setAsking(passkey.id);
                  }}
                />
              </TakesFocus>
            )}
          </View>
        );
      })}
      {!offered ? null : full ? (
        <Body align="start">{t("passkey.tooMany", { max: memberPasskeyRules.perAccount })}</Body>
      ) : (
        <PasskeySetUp
          key={setUpKey}
          label={t("passkey.setUp")}
          disabled={busy !== null}
          onOutcome={(outcome) => {
            if (outcome.kind === "saved") {
              onSaved(outcome.passkey);
              tell(t("passkey.saved"), false);
              return;
            }
            if (outcome.kind === "too_many") onChanged();
            tell(setUpOutcomeText(t, outcome), outcome.kind !== "already");
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.xs, alignItems: "flex-start", alignSelf: "stretch" },
  device: { gap: spacing.xs, alignItems: "flex-start" },
  question: { gap: spacing.sm, alignItems: "flex-start" },
});
