import { useColorScheme } from "react-native";
import { colors, type ColorScheme, type Palette } from "./tokens";

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? colors.dark : colors.light;
}

/** Whether the screen is drawn by day or at night. */
export function useScheme(): ColorScheme {
  return useColorScheme() === "dark" ? "dark" : "light";
}
