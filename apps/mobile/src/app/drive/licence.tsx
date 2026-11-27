import { declareLicenceRoute } from "@shareride/contracts";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Checkbox } from "@/components/checkbox";
import { FieldError } from "@/components/field-error";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { backTo } from "@/driving/back-to";
import { useLanguage } from "@/i18n/language";
import { spacing } from "@/theme/tokens";

/**
 * The driving licence declaration (spec 3, screen 3 and 3.3): one tick, and
 * only its date is kept. The title is at the left, with what we do not ask
 * for under it (spec 31, 3.19).
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
    <Screen>
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
      <Notice message={failure} />
      <Button label={t("licence.confirm")} busy={busy} onPress={() => void confirm()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
});
