import { ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { besideAvatar } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { linkProps } from "@/navigation/link-props";
import { useHover } from "@/theme/hover";
import { radii, spacing } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * A person's line, their picture with the lines about them, as a link to
 * their profile: tinted under the pointer and while pressed, with a
 * chevron at its end unless something else stands there. The driver of a
 * ride has one (spec 31, 3.7), and so has whoever asks a driver for a seat
 * (3.12). A link's name takes the place of what it holds, so `label` says
 * all of it.
 */
export function ProfileLink({
  profileId,
  label,
  chevron,
  children,
}: {
  readonly profileId: string;
  readonly label: string;
  /** At its end, unless a button stands there. */
  readonly chevron: boolean;
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  const [hovered, hover] = useHover();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      {...linkProps({ pathname: "/people/[profileId]", params: { profileId } })}
      {...hover}
      style={({ pressed }) => [
        besideAvatar.row,
        styles.link,
        pressed || hovered ? { backgroundColor: palette.primarySoft } : null,
      ]}
    >
      {children}
      {/* At the middle of the line, whatever its height; the picture stays at its top. */}
      {chevron ? (
        <View style={styles.chevron}>
          <Icon icon={ChevronRight} color={palette.textMuted} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The tint reaches a little past the picture and the chevron, as a row's does in a card.
  link: {
    borderRadius: radii.control,
    padding: spacing.sm,
    margin: -spacing.sm,
  },
  chevron: { alignSelf: "center" },
});
