import {
  getNotificationSettingsRoute,
  updateNotificationSettingsRoute,
} from "@shareride/contracts";
import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Switch } from "@/components/switch";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { spacing } from "@/theme/tokens";

/**
 * The Trip reminders switch in Settings (spec 7, 3.5 and 3.6, item 1): the
 * evening before and an hour before. The rest of the news cannot be
 * turned off (R7.8), and the line under it says so. A change shows at
 * once, and goes back if it could not be saved.
 */
export function TripReminders() {
  const { t } = useLanguage();
  const session = useSession();
  const load = useCallback(() => session.call(getNotificationSettingsRoute, {}), [session]);
  const { value: loaded, reload } = useLoaded(load);
  const [changed, setChanged] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Changes are saved one at a time, so quick taps end on the last one:
  // what the API last saved (null: as loaded), and a change still to send.
  const saved = useRef<boolean | null>(null);
  const waiting = useRef<boolean | null>(null);
  const saving = useRef(false);

  async function change(reminders: boolean) {
    setError(null);
    setChanged(reminders);
    waiting.current = reminders;
    if (saving.current) return;
    saving.current = true;
    let failed: string | null = null;
    while (waiting.current !== null) {
      const body = { reminders: waiting.current };
      waiting.current = null;
      const result = await session.call(updateNotificationSettingsRoute, { body });
      if (result.ok) saved.current = result.data.reminders;
      failed = result.ok ? null : errorText(t, result);
    }
    saving.current = false;
    // What the last save left: the change, or back to what was saved before.
    setChanged(saved.current);
    setError(failed);
  }

  const always = <Body align="start">{t("settings.alwaysOn")}</Body>;
  if (loaded === undefined) return always;
  if (!loaded.ok) {
    return (
      <View style={styles.group}>
        <Notice message={errorText(t, loaded)} />
        <Button variant="secondary" label={t("common.retry")} onPress={reload} />
        {always}
      </View>
    );
  }
  const label = t("settings.reminders");
  const help = t("settings.remindersHelp");
  return (
    <View style={styles.group}>
      <Switch
        label={label}
        spokenLabel={`${label}. ${help}`}
        value={changed ?? loaded.data.reminders}
        onChange={(reminders) => void change(reminders)}
        below={<Body align="start">{help}</Body>}
      />
      <Notice message={error} />
      {always}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
});
