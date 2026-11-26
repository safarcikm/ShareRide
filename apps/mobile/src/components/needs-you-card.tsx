import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { AppPath } from "@/navigation/link-props";
import { chunky } from "@/theme/pressable";
import { edges, halfMinWidth, people, radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Button } from "./button";
import { Icon } from "./icon";

type NeedsYouCardProps =
  | {
      readonly icon: LucideIcon;
      /** One bold line saying what is asked, such as "Dóra asks for 1 seat". */
      readonly title: string;
      /** One line of detail, such as "Mjódd to Selfoss, Fri 27 Nov. 11 h left to answer." */
      readonly detail?: string | undefined;
      /**
       * The one button. Filled where the card is the thing to do; `outlined`
       * on a screen with a main button of its own, such as the last posting
       * step (R31.1).
       */
      readonly action?:
        | ({ readonly label: string; readonly outlined?: boolean } & (
            | { readonly onPress: () => void; readonly href?: never }
            | { readonly href: AppPath; readonly onPress?: never }
          ))
        | undefined;
      readonly children?: never;
    }
  | {
      /** In place of the lines: a whole request on the driver's ride, with its own buttons. */
      readonly children: ReactNode;
    };

/**
 * What needs you now, in the car's yellow (spec 31, 3.2, rule 3, and 3.3):
 * a request to answer, a seat to pay for, a ride on its trip day. A card in
 * `warningSoft` with a bottom edge and an icon square in `people.sun`. The
 * bold line says what is asked; the yellow only repeats it, and is used for
 * nothing else (R31.4). A button in it does not count as the screen's main
 * button (R31.1).
 */
export function NeedsYouCard(props: NeedsYouCardProps) {
  const palette = usePalette();
  return (
    <View
      testID="needs-you-card"
      style={[styles.outer, chunky(edges.card, people.sun, false).outer]}
    >
      <View testID="needs-you-face" style={[styles.face, { backgroundColor: palette.warningSoft }]}>
        {"title" in props ? <Lines {...props} /> : props.children}
      </View>
    </View>
  );
}

function Lines({
  icon,
  title,
  detail,
  action,
}: Extract<NeedsYouCardProps, { readonly title: string }>) {
  const palette = usePalette();
  return (
    <View style={styles.lines}>
      <View style={styles.asked}>
        <View testID="needs-you-icon" style={styles.icon}>
          <Icon icon={icon} color={people.face} />
        </View>
        <View style={styles.texts}>
          <Text style={[typography.bodyStrong, { color: palette.text }]}>{title}</Text>
          {detail === undefined ? null : (
            <Text style={[typography.small, { color: palette.warning }]}>{detail}</Text>
          )}
        </View>
      </View>
      {action === undefined ? null : (
        <View style={styles.action}>
          {action.href === undefined ? (
            <Button
              label={action.label}
              variant={action.outlined === true ? "secondary" : "primary"}
              onPress={action.onPress}
            />
          ) : (
            <Button
              label={action.label}
              variant={action.outlined === true ? "secondary" : "primary"}
              href={action.href}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { borderRadius: radii.card },
  face: {
    borderRadius: radii.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.ms,
    gap: spacing.ms,
  },
  // The button stands beside the lines where there is room for both, and
  // under them at the right on a phone.
  lines: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.ms,
  },
  asked: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: halfMinWidth,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.ms,
  },
  icon: {
    width: sizes.rowIcon,
    height: sizes.rowIcon,
    borderRadius: radii.tag,
    backgroundColor: people.sun,
    alignItems: "center",
    justifyContent: "center",
  },
  // One line stands at the icon's middle; two start at its top.
  texts: { flex: 1, minHeight: sizes.rowIcon, justifyContent: "center" },
  // Never wider than the card: with large text its label wraps instead.
  action: { maxWidth: "100%" },
});
