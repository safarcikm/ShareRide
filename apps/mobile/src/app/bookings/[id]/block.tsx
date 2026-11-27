import { blockFromBookingRoute, bookingRoute } from "@shareride/contracts";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { otherPerson } from "@/chat/texts";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { firstNameOf } from "@/people/texts";
import { BlockPerson } from "@/safety/block-person";
import { usePalette } from "@/theme/use-palette";

/**
 * Blocking the other person of a booking, from its conversation (spec 9,
 * 3.2; screen 3), named through the booking; then back to the conversation.
 */
export default function BlockScreen() {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => session.call(bookingRoute, { params: { id } }), [session, id]);
  const { value: answer, reload } = useLoaded(load);
  const block = useCallback(
    () => session.call(blockFromBookingRoute, { params: { id }, body: {} }),
    [session, id],
  );
  const chat = { pathname: "/messages/[bookingId]", params: { bookingId: id } } as const;
  const back = <BackButton fallback={chat} />;

  if (answer === undefined) {
    return (
      <Screen>
        {back}
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </Screen>
    );
  }
  if (!answer.ok) {
    return (
      <Screen>
        {back}
        <Notice message={answer.status === 404 ? t("booking.notFound") : errorText(t, answer)} />
        <Button variant="secondary" label={t("common.retry")} onPress={reload} />
      </Screen>
    );
  }
  return (
    <BlockPerson
      name={firstNameOf(t, otherPerson(answer.data))}
      back={chat}
      block={block}
      gone={t("booking.notFound")}
      done={{
        label: t("block.backToChat"),
        go: () => {
          router.dismissTo(chat);
        },
      }}
    />
  );
}
