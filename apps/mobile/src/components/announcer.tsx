import { useEffect } from "react";
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from "react-native";

/**
 * Reads `message` out each time it changes, showing nothing: announced on
 * phones, and through a live region on the web, which cannot announce
 * (as `FieldError` does). `count` tells two messages with the same words apart.
 */
export function Announcer({
  message,
}: {
  readonly message: { readonly text: string; readonly count: number } | null;
}) {
  useEffect(() => {
    if (message !== null && Platform.OS !== "web") {
      AccessibilityInfo.announceForAccessibility(message.text);
    }
  }, [message]);
  if (Platform.OS !== "web") return null;
  return (
    <View accessibilityLiveRegion="polite" style={styles.unseen}>
      <Text>{message?.text ?? ""}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Out of sight but still read, as the web's usual "visually hidden" text.
  unseen: { position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 },
});
