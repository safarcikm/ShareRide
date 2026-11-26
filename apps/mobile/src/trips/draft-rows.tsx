import type { MyTrip } from "@shareride/contracts";
import { FilePen, Files } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ActionRows } from "@/components/action-rows";
import { Row } from "@/components/row";
import { TakesFocus } from "@/components/takes-focus";
import { Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { spacing } from "@/theme/tokens";
import { resumeStep, stepHref } from "./steps";
import { dayAtTime, routeText } from "./texts";

/** How many drafts show before "Show all drafts" brings the others. */
const shownAtFirst = 3;

/**
 * The rides I started to offer and have not published, over Offer's form
 * (spec 31, 3.11, item 6): one card of rows, the draft changed last
 * first, each with its route and under it the day and time it leaves, or
 * that none is chosen yet, which tells two drafts of one route apart. A
 * row opens its draft at the step where it was left. More than three fold
 * under "Show all drafts", the card's last row, which goes once pressed;
 * focus then goes to the first draft that came. Only the press moves
 * focus: drafts that are read again later come without it.
 */
export function DraftRows({ drafts }: { readonly drafts: readonly MyTrip[] }) {
  const { locale, t } = useLanguage();
  // "opening" from the press until focus has gone to the first that came.
  const [shown, setShown] = useState<"some" | "opening" | "all">("some");
  if (drafts.length === 0) return null;
  const row = (trip: MyTrip) => {
    const route = routeText(t, locale, trip);
    const when =
      trip.departsAt === null
        ? t("trip.draftNoTime")
        : dayAtTime(t, locale, new Date(trip.departsAt));
    return (
      <Row
        key={trip.id}
        icon={FilePen}
        title={route}
        value={when}
        stacked
        accessibilityLabel={`${t("trip.continueDraft", { route })}, ${when}`}
        href={stepHref(trip.id, resumeStep(trip))}
      />
    );
  };
  const [fourth, ...others] = shown === "some" ? [] : drafts.slice(shownAtFirst);
  return (
    <View testID="draft-rows" style={styles.drafts}>
      <Heading>{t("trip.mine.drafts")}</Heading>
      <ActionRows>
        {drafts.slice(0, shownAtFirst).map(row)}
        {fourth === undefined ? null : (
          <TakesFocus
            when={shown === "opening"}
            onFocused={() => {
              setShown("all");
            }}
          >
            {row(fourth)}
          </TakesFocus>
        )}
        {others.map(row)}
        {shown !== "some" || drafts.length <= shownAtFirst ? null : (
          <Row
            icon={Files}
            title={t("trip.allDrafts")}
            onPress={() => {
              setShown("opening");
            }}
          />
        )}
      </ActionRows>
    </View>
  );
}

const styles = StyleSheet.create({
  drafts: { gap: spacing.sm },
});
