import { leavesCapitalArea, type Region } from "@shareride/domain";
import type { Locale, MessageKey } from "@shareride/i18n";
import { useState } from "react";
import { Linking } from "react-native";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Body, Heading } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { shareText, type ShareOutcome } from "@/lib/share";

/**
 * The pages "Before you go" links to (spec 9, 3.3.2), in the reader's
 * language where the site has one. SafeTravel is in English only.
 */
export const beforeYouGoLinks: readonly {
  readonly label: MessageKey;
  readonly url: Readonly<Record<Locale, string>>;
}[] = [
  { label: "safety.weather", url: { is: "https://www.vedur.is/", en: "https://en.vedur.is/" } },
  { label: "safety.roads", url: { is: "https://umferdin.is/", en: "https://umferdin.is/en" } },
  {
    label: "safety.safeTravel",
    url: { is: "https://safetravel.is/", en: "https://safetravel.is/" },
  },
];

type Problem = "call" | "link" | ShareOutcome;

const problemKeys: Partial<Record<Problem, MessageKey>> = {
  call: "safety.callFailed",
  link: "safety.linkFailed",
  copied: "share.copied",
  failed: "share.failed",
};

/**
 * Safety on a trip (spec 9, 3.3): "Emergency: 112", "Before you go" when
 * the trip leaves the capital area, and "Share trip details" when there is
 * something to share. Milestone 7's trip day places it on its own layout.
 */
export function TripSafety({
  regions,
  share,
}: {
  /** The regions of the stops the viewer travels between. */
  readonly regions: readonly Region[];
  /** The text "Share trip details" sends; null to leave the button out. */
  readonly share: string | null;
}) {
  const { locale, t } = useLanguage();
  const [problem, setProblem] = useState<Problem | null>(null);
  const key = problem === null ? undefined : problemKeys[problem];
  const open = (url: string, failure: Problem) => {
    setProblem(null);
    Linking.openURL(url).catch(() => {
      setProblem(failure);
    });
  };

  return (
    <Card>
      <Heading>{t("safety.title")}</Heading>
      <Button
        variant="secondary"
        label={t("safety.call112")}
        accessibilityLabel={t("safety.call112Label")}
        onPress={() => {
          open("tel:112", "call");
        }}
      />
      {leavesCapitalArea(regions) ? (
        <>
          <Body align="start">{t("safety.beforeYouGo")}</Body>
          {beforeYouGoLinks.map((link) => (
            <TextLink
              key={link.label}
              align="start"
              label={t(link.label)}
              onPress={() => {
                open(link.url[locale], "link");
              }}
            />
          ))}
        </>
      ) : null}
      {share === null ? null : (
        <Button
          variant="secondary"
          label={t("share.title")}
          onPress={() => {
            setProblem(null);
            void shareText(share).then(setProblem);
          }}
        />
      )}
      <Notice
        kind={problem === "copied" ? "info" : "error"}
        message={key === undefined ? null : t(key)}
      />
    </Card>
  );
}
