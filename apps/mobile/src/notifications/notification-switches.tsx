import {
  getNotificationSettingsRoute,
  updateNotificationSettingsRoute,
} from "@shareride/contracts";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Row } from "@/components/row";
import { Switch } from "@/components/switch";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { spacing } from "@/theme/tokens";

type Preference = "reminders" | "betaNews";

/**
 * What a person can turn off in Settings (R7.8): trip reminders, the
 * evening before and an hour before (spec 7, 3.5 and 3.6, item 1), and
 * beta news, ShareRide's announcements to testers (spec 10, 3.5.4), with
 * the page that lists them. The rest of the news cannot be turned off,
 * and a line says so.
 */
export function NotificationSwitches() {
  const { t } = useLanguage();
  const router = useRouter();
  const session = useSession();
  const load = useCallback(() => session.call(getNotificationSettingsRoute, {}), [session]);
  const { value: loaded, reload } = useLoaded(load);

  const always = <Body align="start">{t("settings.alwaysOn")}</Body>;
  const news = (
    <Card>
      <Row
        title={t("betaNews.title")}
        onPress={() => {
          router.push("/settings/beta-news");
        }}
      />
    </Card>
  );
  if (loaded === undefined) return always;
  if (!loaded.ok) {
    return (
      <View style={styles.group}>
        <Notice message={errorText(t, loaded)} />
        <Button variant="secondary" label={t("common.retry")} onPress={reload} />
        {always}
        {news}
      </View>
    );
  }
  return (
    <View style={styles.group}>
      <PreferenceSwitch
        name="reminders"
        on={loaded.data.reminders}
        label={t("settings.reminders")}
        help={t("settings.remindersHelp")}
      />
      {always}
      <PreferenceSwitch
        name="betaNews"
        on={loaded.data.betaNews}
        label={t("settings.betaNews")}
        help={t("settings.betaNewsHelp")}
      />
      {news}
    </View>
  );
}

/** One switch. A change shows at once, and goes back if it could not be saved. */
function PreferenceSwitch({
  name,
  on,
  label,
  help,
}: {
  readonly name: Preference;
  /** As loaded. */
  readonly on: boolean;
  readonly label: string;
  readonly help: string;
}) {
  const { t } = useLanguage();
  const session = useSession();
  const [changed, setChanged] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Changes are saved one at a time, so quick taps end on the last one:
  // what the API last saved (null: as loaded), and a change still to send.
  const saved = useRef<boolean | null>(null);
  const waiting = useRef<boolean | null>(null);
  const saving = useRef(false);

  async function change(value: boolean) {
    setError(null);
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
    setError(failed);
  }

  return (
    <>
      <Switch
        label={label}
        spokenLabel={`${label}. ${help}`}
        value={changed ?? on}
        onChange={(value) => void change(value)}
        below={<Body align="start">{help}</Body>}
      />
      <Notice message={error} />
    </>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
});
