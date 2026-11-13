import { useColorScheme } from "react-native";
import { colors, type Palette } from "./tokens";

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? colors.dark : colors.light;
}
