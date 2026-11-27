import { declareLicenceRoute } from "@shareride/contracts";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Checkbox } from "@/components/checkbox";
import { FieldError } from "@/components/field-error";
import { ActionNotice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { backTo } from "@/driving/back-to";
import { useLanguage } from "@/i18n/language";
import { spacing } from "@/theme/tokens";

/**
 * The driving licence declaration (spec 3, screen 3 and 3.3): one tick, and
 * only its date is kept. The title is at the left, with what we do not ask
 * for under it, and Confirm is the main button, in the bar, which says
 * over itself why it could not be saved (spec 31, 3.19 and R31.1).
 */
export default function LicenceScreen() {
  const { t } = useLanguage();
  const session = useSession();
  const [declared, setDeclared] = useState(false);
  const [needTick, setNeedTick] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!declared) {
      setNeedTick(true);
      return;
    }
    setFailure(null);
    setBusy(true);
    const result = await session.call(declareLicenceRoute, { body: { declared: true } });
    setBusy(false);
    if (result.ok) backTo("/profile");
    else setFailure(errorText(t, result));
  }

  return (
    <Screen
      footer={
        <>
          <ActionNotice says={failure} />
          <Button main label={t("licence.confirm")} busy={busy} onPress={() => void confirm()} />
        </>
      }
    >
      <ScreenHead title={t("licence.title")} line={t("licence.intro")} back="/profile" />
      <View style={styles.group}>
        <Checkbox
          label={t("licence.declare")}
          checked={declared}
          onChange={(checked) => {
            setDeclared(checked);
            if (checked) setNeedTick(false);
          }}
        />
        <FieldError message={needTick ? t("licence.needTick") : undefined} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
});
