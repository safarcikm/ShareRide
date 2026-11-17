import fredoka500 from "@expo-google-fonts/fredoka/500Medium/Fredoka_500Medium.ttf";
import fredoka600 from "@expo-google-fonts/fredoka/600SemiBold/Fredoka_600SemiBold.ttf";
import nunito400 from "@expo-google-fonts/nunito/400Regular/Nunito_400Regular.ttf";
import nunito600 from "@expo-google-fonts/nunito/600SemiBold/Nunito_600SemiBold.ttf";
import nunito700 from "@expo-google-fonts/nunito/700Bold/Nunito_700Bold.ttf";

/** The app's fonts, bundled with the console (nothing is fetched from Google). */
const faces = [
  ["Fredoka", "500", fredoka500],
  ["Fredoka", "600", fredoka600],
  ["Nunito", "400", nunito400],
  ["Nunito", "600", nunito600],
  ["Nunito", "700", nunito700],
] as const;

/**
 * Loads the fonts through the CSS Font Loading API, which the content
 * security policy allows. Text shows in the system font until they arrive.
 */
export function loadFonts(): void {
  if (typeof FontFace === "undefined") return;
  for (const [family, weight, url] of faces) {
    const face = new FontFace(family, `url(${url})`, { weight, display: "swap" });
    document.fonts.add(face);
    face.load().catch(() => undefined);
  }
}
