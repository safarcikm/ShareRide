import { Platform } from "react-native";

interface KeyDown {
  readonly key: string;
  readonly repeat: boolean;
  preventDefault(): void;
}

/**
 * On the web, Space ticks a tick box or picks a radio, as on any web page;
 * react-native-web lets Space press only buttons (Enter works for all).
 * Spread the result onto the Pressable.
 */
export function spaceKeyPresses(onPress: () => void): object {
  if (Platform.OS !== "web") return {};
  return {
    onKeyDown: (event: KeyDown) => {
      if (event.key !== " " && event.key !== "Spacebar") return;
      event.preventDefault(); // Space would scroll the page instead.
      if (!event.repeat) onPress();
    },
  };
}
