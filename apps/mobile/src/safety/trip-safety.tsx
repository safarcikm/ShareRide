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

type Problem = "link" | ShareOutcome;

const problemKeys: Partial<Record<Problem, MessageKey>> = {
  link: "safety.linkFailed",
  copied: "share.copied",
};

/**
 * Safety on a trip (spec 9, 3.3): "Before you go" when the trip leaves the
 * capital area, and "Share trip details" when there is something to share;
 * nothing when neither applies. People dial 112 themselves: the app has no
 * button for it (Martin, 2026-11-18). Milestone 7's trip day places it on
 * its own layout.
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
  const open = (url: string) => {
    setProblem(null);
    Linking.openURL(url).catch(() => {
      setProblem("link");
    });
  };
  const beforeYouGo = leavesCapitalArea(regions);
  if (!beforeYouGo && share === null) return null;

  return (
    <Card>
      <Heading>{t("safety.title")}</Heading>
      {beforeYouGo ? (
        <>
          <Body align="start">{t("safety.beforeYouGo")}</Body>
          {beforeYouGoLinks.map((link) => (
            <TextLink
              key={link.label}
              align="start"
              label={t(link.label)}
              onPress={() => {
                open(link.url[locale]);
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
      {problem === "failed" && share !== null ? (
        // No share sheet and no clipboard: the text itself, to copy by hand.
        <Notice selectable message={t("share.failed", { details: share })} />
      ) : (
        <Notice
          kind={problem === "copied" ? "info" : "error"}
          message={key === undefined ? null : t(key)}
        />
      )}
    </Card>
  );
}
