import type { Rating } from "@shareride/contracts";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Avatar, besideAvatar } from "@/components/avatar";
import { Card } from "@/components/card";
import { Tag } from "@/components/tag";
import { useLanguage } from "@/i18n/language";
import { RatingLine } from "@/people/standing";
import { sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/** How a person stands, as anyone signed in sees it on their profile. */
export interface PersonStanding {
  readonly rating: Rating;
  readonly phoneVerified: boolean;
  readonly emailVerified: boolean;
}

/**
 * Who a person is, in a card (spec 31, 3.14): the picture, the name, and
 * small `lines` under it such as what they speak and since when they are a
 * member, with at most one control at the right, such as Edit, which goes
 * under them where the card has no room for both. Then how they stand, on
 * one line that wraps: the rating and what is checked, left out when it is
 * not known. While it is `"reading"`, the line's room is kept, so nothing
 * under it moves when it comes. Then what the screen puts under it, such as
 * the photo's controls on my own.
 *
 * The name is plain text: the screen's title stands over the card.
 */
export function PersonCard({
  firstName,
  colour,
  photo,
  lines,
  standing,
  action,
  children,
}: {
  readonly firstName: string;
  readonly colour: number;
  /** A link from the API, or null for none. */
  readonly photo: string | null;
  readonly lines: readonly string[];
  readonly standing?: PersonStanding | "reading" | undefined;
  readonly action?: ReactNode;
  readonly children?: ReactNode;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  return (
    <Card>
      <View testID="person-card" style={styles.card}>
        <View style={styles.withAction}>
          <View style={[besideAvatar.row, styles.who]}>
            <Avatar firstName={firstName} colour={colour} photo={photo} />
            <View style={besideAvatar.text}>
              <Text style={[typography.heading, { color: palette.text }]}>{firstName}</Text>
              {lines.map((line) => (
                <Text key={line} style={[typography.small, { color: palette.textMuted }]}>
                  {line}
                </Text>
              ))}
            </View>
          </View>
          {action === undefined || action === null ? null : (
            <View testID="person-card-action">{action}</View>
          )}
        </View>
        {standing === undefined ? null : standing === "reading" ? (
          // As high as the line's words, with nothing to see or to read out.
          <Text
            testID="person-card-standing-room"
            style={typography.bodyStrong}
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {"\u00A0"}
          </Text>
        ) : (
          <View testID="person-card-standing" style={styles.standing}>
            <RatingLine rating={standing.rating} strong inline />
            {standing.phoneVerified ? (
              <Tag kind="positive" label={t("people.phoneVerified")} />
            ) : null}
            {standing.emailVerified ? (
              <Tag kind="positive" label={t("people.emailVerified")} />
            ) : null}
          </View>
        )}
        {children}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.ms },
  // The person and the button beside them; the button goes under the
  // person where the card has no room for both.
  withAction: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: spacing.ms,
    rowGap: spacing.sm,
  },
  who: { flexGrow: 1, flexShrink: 1, flexBasis: sizes.wordsBeside, minWidth: 0 },
  standing: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: spacing.sm,
    rowGap: spacing.xs,
  },
});
