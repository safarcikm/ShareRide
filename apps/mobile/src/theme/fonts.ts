import { Fredoka_500Medium, Fredoka_600SemiBold } from "@expo-google-fonts/fredoka";
import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold } from "@expo-google-fonts/nunito";
import { useFonts } from "expo-font";
import { fonts } from "./tokens";

/** The font files, bundled with the app (nothing is fetched from Google). */
export const fontAssets = {
  [fonts.display]: Fredoka_600SemiBold,
  [fonts.displayMedium]: Fredoka_500Medium,
  [fonts.body]: Nunito_400Regular,
  [fonts.bodySemiBold]: Nunito_600SemiBold,
  [fonts.bodyBold]: Nunito_700Bold,
};

/**
 * True once the fonts are loaded, or have failed to load: then the app opens
 * with the system fonts rather than waiting (spec 15, section 6).
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(fontAssets);
  return loaded || error !== null;
}
