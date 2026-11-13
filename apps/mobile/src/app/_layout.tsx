import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LanguageProvider } from "@/i18n/language";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
