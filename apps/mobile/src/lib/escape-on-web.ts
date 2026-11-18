import { Platform } from "react-native";

/**
 * On the web, Escape closes what is open under a field, such as a list of
 * places or a calendar, wherever focus is inside the part given these props.
 * Phones have no such key; Android's back does the same there.
 */
export function escapeOnWeb(onClose: () => void): object {
  if (Platform.OS !== "web") return {};
  return {
    onKeyDown: (event: { key: string }) => {
      if (event.key === "Escape") onClose();
    },
  };
}
