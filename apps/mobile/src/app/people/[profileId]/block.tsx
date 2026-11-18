import { blockFromProfileRoute, publicProfileRoute } from "@shareride/contracts";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { BlockPerson } from "@/safety/block-person";
import { usePalette } from "@/theme/use-palette";

/**
 * Blocking the person a profile shows (spec 9, 3.2.1), named by the
 * profile; then back to it. Someone who left is not there to block.
 */
export default function BlockFromProfileScreen() {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const load = useCallback(
    () => session.call(publicProfileRoute, { params: { profileId } }),
    [session, profileId],
  );
  const { value: answer, reload } = useLoaded(load);
  const block = useCallback(
    () => session.call(blockFromProfileRoute, { params: { profileId }, body: {} }),
    [session, profileId],
  );
  const back = <BackButton fallback={{ pathname: "/people/[profileId]", params: { profileId } }} />;

  if (answer === undefined) {
    return (
      <Screen>
        {back}
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </Screen>
    );
  }
  if (!answer.ok) {
    // A profile no longer there, or an address that is none (as the profile says).
    const gone = answer.status === 404 || answer.status === 400;
    return (
      <Screen>
        {back}
        <Notice message={gone ? t("people.notFound") : errorText(t, answer)} />
        {gone ? null : <Button variant="secondary" label={t("common.retry")} onPress={reload} />}
      </Screen>
    );
  }
  return (
    <BlockPerson
      name={answer.data.firstName}
      back={back}
      block={block}
      gone={t("people.notFound")}
      done={{
        label: t("block.backToProfile"),
        go: () => {
          router.dismissTo({ pathname: "/people/[profileId]", params: { profileId } });
        },
      }}
    />
  );
}
