import type { Need } from "@shareride/domain";
import { Bell, Clock, Wallet } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { NeedsYouCard } from "@/components/needs-you-card";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { spacing } from "@/theme/tokens";
import { rideHref } from "./my-ride-ticket";
import { needCardTexts } from "./need-texts";
import type { Ride } from "./rides";

const icons = { answer: Bell, pay: Wallet, tripDay: Clock } as const;

/**
 * What needs me now, the soonest first, as the yellow card on Find (spec
 * 31, 3.3 item 3 and 3.5): who asks for a seat, a seat to pay for, or a
 * ride on its trip day, with one button that opens the ride, where it is
 * done. When more rides need me, "and 2 more" under it opens My rides,
 * which lists them all.
 */
export function NeedsMeCard({
  first,
  more,
  at,
}: {
  /** The soonest need, as `needing` puts it first. */
  readonly first: { readonly ride: Ride; readonly need: Need };
  /** How many other rides need me. */
  readonly more: number;
  readonly at: Date;
}) {
  const { locale, t } = useLanguage();
  const { title, detail, action } = needCardTexts(t, locale, first.ride, first.need, at);
  return (
    <View style={styles.card}>
      <NeedsYouCard
        icon={icons[first.need.kind]}
        title={title}
        detail={detail}
        action={{ label: action, href: rideHref(first.ride) }}
      />
      {more === 0 ? null : (
        <TextLink
          label={t("needs.more", { count: more })}
          accessibilityLabel={t("needs.moreLabel", { count: more })}
          href="/my-rides"
          align="start"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
});
