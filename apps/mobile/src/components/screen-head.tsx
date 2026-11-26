import type { Href } from "expo-router";
import type { ReactNode } from "react";
import { Platform, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { BackButton } from "./back-button";
import { Title } from "./text";

/**
 * The top of a screen (spec 31, 3.2, rule 5, and 3.3): Back, then the title
 * at the left, which says what is going on, with at most one line under it
 * and at most one round icon button at the right, such as Share. Small text
 * `over` the title names what the title is about, such as a ride's day. On
 * a posting step the `road` stands beside Back and the title has the whole
 * width under them. Where a title has no room for its longest word between
 * Back and the button, as "Keflavíkurflugvöllur" has not on a narrow phone,
 * the button goes over the title, which then has the width beside Back.
 *
 * (`PageHead` is the title a page has for search engines.)
 */
export function ScreenHead({
  title,
  over,
  line,
  back = "/",
  action,
  road,
}: {
  readonly title: string;
  readonly over?: string | undefined;
  readonly line?: string | undefined;
  /** Where Back leads when there is nothing to go back to; null for no Back. */
  readonly back?: Href | null;
  readonly action?: ReactNode;
  readonly road?: ReactNode;
}) {
  const palette = usePalette();
  const backButton = back === null ? null : <BackButton fallback={back} />;
  const titles = (
    <View style={styles.titles}>
      {over === undefined ? null : (
        <Text style={[typography.small, { color: palette.textMuted }]}>{over}</Text>
      )}
      <Title align="start">{title}</Title>
      {line === undefined ? null : (
        <Text style={[typography.body, { color: palette.textMuted }]}>{line}</Text>
      )}
    </View>
  );
  if (road !== undefined && road !== null) {
    return (
      <View style={styles.step}>
        <View testID="screen-head" style={styles.head}>
          {backButton}
          <View testID="screen-head-road" style={styles.road}>
            {road}
          </View>
        </View>
        {titles}
      </View>
    );
  }
  return (
    <View testID="screen-head" style={styles.head}>
      {backButton}
      {action === undefined || action === null ? (
        <View style={[styles.titles, styles.beside]}>{titles}</View>
      ) : (
        // The title comes first, for a keyboard and a screen reader; the
        // lines wrap upwards, so a button with no room beside the title's
        // longest word stands over the title, at the right, level with Back.
        <View testID="screen-head-titles-and-action" style={styles.withAction}>
          <View style={[styles.besideAction, wholeWords]}>{titles}</View>
          <View testID="screen-head-action" style={styles.action}>
            {action}
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * On the web the titles are never narrower than their longest word, so the
 * button moves before a word is split. React Native's types and phones
 * lack `min-content`; a phone keeps the button beside the title.
 */
const wholeWords =
  Platform.OS === "web" ? ({ flexBasis: "min-content" } as unknown as ViewStyle) : null;

/** The title's first line stands at the middle of the buttons beside it. */
const titleDrop = (sizes.iconButton - typography.title.lineHeight) / 2;

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start", gap: spacing.ms },
  titles: { flexShrink: 1 },
  beside: { flex: 1, minWidth: 0, paddingTop: titleDrop },
  withAction: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap-reverse",
    // With the lines' order turned, the end of a line is its top.
    alignItems: "flex-end",
    columnGap: spacing.ms,
  },
  besideAction: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, paddingTop: titleDrop },
  action: { marginLeft: "auto" },
  step: { gap: spacing.ms },
  road: { flex: 1, minWidth: 0 },
});
