import { myNoticesRoute, type Me } from "@shareride/contracts";
import { router } from "expo-router";
import { useCallback } from "react";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { momentText } from "./notices";

/**
 * Find and Offer for a suspended person (spec 9, 3.6.2): until when, the
 * reason, what they can no longer do and what stays open, and the way to
 * Notices, where they appeal. My rides, Messages and Profile stay as they are.
 */
export function SuspendedAccount({
  suspension,
}: {
  readonly suspension: NonNullable<Me["suspension"]>;
}) {
  const { locale, t } = useLanguage();
  const session = useSession();
  const load = useCallback(() => session.call(myNoticesRoute, {}), [session]);
  const { value: answer } = useLoaded(load);
  // The latest suspension's reason; without an answer, Notices still has it.
  const notice =
    answer?.ok === true ? answer.data.notices.find((one) => one.kind === "suspension") : undefined;
  return (
    <Screen>
      <Title>{t("suspended.title")}</Title>
      <Body>
        {suspension.until === null
          ? t("suspended.noEnd")
          : t("suspended.until", { until: momentText(t, locale, suspension.until) })}
      </Body>
      {notice === undefined ? null : <Body>{t("notice.reason", { reason: notice.reason })}</Body>}
      <Body>{t("suspended.help")}</Body>
      <Button
        label={t("suspended.readWhy")}
        onPress={() => {
          router.push("/notices");
        }}
      />
      <Button
        variant="secondary"
        label={t("nav.myRides")}
        onPress={() => {
          router.push("/my-rides");
        }}
      />
    </Screen>
  );
}
