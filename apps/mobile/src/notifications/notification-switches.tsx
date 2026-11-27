import {
  getNotificationSettingsRoute,
  updateNotificationSettingsRoute,
} from "@shareride/contracts";
import { AlarmClock, FlaskConical, Newspaper, type LucideIcon } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { ActionRows } from "@/components/action-rows";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Row } from "@/components/row";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

type Preference = "reminders" | "betaNews";
type Failures = Readonly<Record<Preference, string | null>>;

/**
 * What a person can turn off, on the notifications' page of Profile
 * (R7.8; spec 31, 3.14): trip reminders, the evening before and an hour
 * before (spec 7, 3.5 and 3.6, item 1), and beta news, PuffinRide's
 * announcements to testers (spec 10, 3.5.4), as two rows of one card, each
 * a switch with what it does under its name. The rest of the news cannot
 * be turned off, and a quiet line under the card says so. The way to the
 * page that lists the beta news is a row of a card of its own.
 */
export function NotificationSwitches() {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const load = useCallback(() => session.call(getNotificationSettingsRoute, {}), [session]);
  const { value: loaded, reload } = useLoaded(load);
  // Why a change could not be saved, under the card: a row holds no notice.
  const [failures, setFailures] = useState<Failures>({ reminders: null, betaNews: null });
  const failed = useCallback((name: Preference, why: string | null) => {
    setFailures((now) => (now[name] === why ? now : { ...now, [name]: why }));
  }, []);

  const always = (
    <Text style={[typography.small, { color: palette.textMuted }]}>{t("settings.alwaysOn")}</Text>
  );
  const news = (
    <ActionRows>
      <Row
        icon={Newspaper}
        title={t("betaNews.title")}
        value={t("betaNews.help")}
        stacked
        href="/settings/beta-news"
      />
    </ActionRows>
  );
  if (loaded === undefined) return always;
  if (!loaded.ok) {
    return (
      <View style={styles.page}>
        <View style={styles.group}>
          <Notice message={errorText(t, loaded)} />
          <Button variant="secondary" label={t("common.retry")} onPress={reload} />
          {always}
        </View>
        {news}
      </View>
    );
  }
  return (
    <View style={styles.page}>
      <View style={styles.group}>
        <ActionRows>
          <PreferenceRow
            name="reminders"
            icon={AlarmClock}
            on={loaded.data.reminders}
            label={t("settings.reminders")}
            help={t("settings.remindersHelp")}
            onFailed={failed}
          />
          <PreferenceRow
            name="betaNews"
            icon={FlaskConical}
            on={loaded.data.betaNews}
            label={t("settings.betaNews")}
            help={t("settings.betaNewsHelp")}
            onFailed={failed}
          />
        </ActionRows>
        <Notice message={failures.reminders} />
        <Notice message={failures.betaNews} />
        {always}
      </View>
      {news}
    </View>
  );
}

/** One switch, a row. A change shows at once, and goes back if it could not be saved. */
function PreferenceRow({
  name,
  icon,
  on,
  label,
  help,
  onFailed,
}: {
  readonly name: Preference;
  readonly icon: LucideIcon;
  /** As loaded. */
  readonly on: boolean;
  readonly label: string;
  readonly help: string;
  /** Why the last change could not be saved; null once one is tried again or saved. */
  readonly onFailed: (name: Preference, why: string | null) => void;
}) {
  const { t } = useLanguage();
  const session = useSession();
  const [changed, setChanged] = useState<boolean | null>(null);
  // Changes are saved one at a time, so quick taps end on the last one:
  // what the API last saved (null: as loaded), and a change still to send.
  const saved = useRef<boolean | null>(null);
  const waiting = useRef<boolean | null>(null);
  const saving = useRef(false);

  async function change(value: boolean) {
    onFailed(name, null);
    setChanged(value);
    waiting.current = value;
    if (saving.current) return;
    saving.current = true;
    let failed: string | null = null;
    while (waiting.current !== null) {
      // Only this switch: the other keeps what it has.
      const body =
        name === "reminders" ? { reminders: waiting.current } : { betaNews: waiting.current };
      waiting.current = null;
      const result = await session.call(updateNotificationSettingsRoute, { body });
      if (result.ok) saved.current = result.data[name];
      failed = result.ok ? null : errorText(t, result);
    }
    saving.current = false;
    // What the last save left: the change, or back to what was saved before.
    setChanged(saved.current);
    onFailed(name, failed);
  }

  return (
    <Row
      icon={icon}
      title={label}
      value={help}
      stacked
      accessibilityLabel={`${label}. ${help}`}
      switched={changed ?? on}
      onSwitch={(value) => void change(value)}
    />
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.lg },
  group: { gap: spacing.sm },
});
