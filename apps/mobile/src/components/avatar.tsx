import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { apiBaseUrl } from "@/auth/api";
import { useLanguage } from "@/i18n/language";
import { photoUrl } from "@/lib/photo-url";
import { people, peopleColours, radii, spacing, typography } from "@/theme/tokens";

/**
 * A person's `Avatar` (spec 15, section 5.2): their profile photo (spec 1,
 * 3.5), or the first letter of their first name on their people colour
 * (section 4.2) when they have none or it does not load. Screen readers
 * skip it: the name is always written beside it.
 */
export function Avatar({
  firstName,
  colour,
  photo = null,
}: {
  readonly firstName: string;
  readonly colour: number;
  /** A link from the API, or null for none. */
  readonly photo?: string | null;
}) {
  const { locale } = useLanguage();
  // The link that did not load; a new photo gets its own link and is tried.
  const [failed, setFailed] = useState<string | null>(null);
  const shown = photo !== null && photo !== failed;
  return (
    <View
      testID="avatar"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.avatar,
        { backgroundColor: peopleColours[colour % peopleColours.length] ?? people.glacier },
      ]}
    >
      {shown ? (
        <Image
          testID="avatar-photo"
          source={{ uri: photoUrl(photo, apiBaseUrl()) }}
          onError={() => {
            setFailed(photo);
          }}
          style={styles.photo}
        />
      ) : (
        <Text style={[typography.heading, { color: people.face }]}>
          {firstName.charAt(0).toLocaleUpperCase(locale)}
        </Text>
      )}
    </View>
  );
}

export const avatarSize = spacing.xxl;

/**
 * A picture with what is written beside it, the name first: a line or two
 * stand at the picture's middle, and a taller block starts at its top, so
 * the picture stays with the name (spec 31, 3.18).
 */
export const besideAvatar = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.ms },
  text: { flex: 1, minHeight: avatarSize, justifyContent: "center" },
});

const styles = StyleSheet.create({
  avatar: {
    width: avatarSize,
    height: avatarSize,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photo: { width: avatarSize, height: avatarSize },
});
