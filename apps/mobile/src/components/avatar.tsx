import { StyleSheet, Text, View } from "react-native";
import { useLanguage } from "@/i18n/language";
import { people, peopleColours, radii, spacing, typography } from "@/theme/tokens";

/**
 * A person's `Avatar` (spec 15, section 5.2): until profile photos come, the
 * first letter of their first name on their people colour (section 4.2).
 * Screen readers skip it: the name is always written beside it.
 */
export function Avatar({
  firstName,
  colour,
}: {
  readonly firstName: string;
  readonly colour: number;
}) {
  const { locale } = useLanguage();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.avatar,
        { backgroundColor: peopleColours[colour % peopleColours.length] ?? people.glacier },
      ]}
    >
      <Text style={[typography.heading, { color: people.face }]}>
        {firstName.charAt(0).toLocaleUpperCase(locale)}
      </Text>
    </View>
  );
}

export const avatarSize = spacing.xxl;

const styles = StyleSheet.create({
  avatar: {
    width: avatarSize,
    height: avatarSize,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
