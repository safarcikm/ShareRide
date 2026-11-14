import { Stack, type ErrorBoundaryProps } from "expo-router";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession, useSessionState } from "@/auth/session";
import { Button } from "@/components/button";
import { Loading } from "@/components/loading";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { LanguageProvider, useLanguage } from "@/i18n/language";
import { reportError, startErrorReporting } from "@/lib/error-reporting";
import { useAppFonts } from "@/theme/fonts";
import { installFocusRing } from "@/theme/focus-ring";

startErrorReporting();
installFocusRing();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <SessionProvider>
          <Navigation />
        </SessionProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}

/**
 * Which screens can open depends on the session: some are open to
 * everyone, some only to signed-out people, and signed-in people go through
 * the terms and then the profile before the rest (spec 1, 3.4 and 3.5).
 * When the session changes (signed in, a step done, signed out, or the
 * session ended elsewhere), screens that no longer fit close and the app
 * returns to the start, which leads on from there. Fonts load at the same
 * time; if they fail, the app opens with the system fonts.
 */
function Navigation() {
  const state = useSessionState();
  // Fonts load while the session is restored; both finish behind Loading.
  const fontsReady = useAppFonts();
  if (state.status === "loading" || !fontsReady) return <Loading />;
  if (state.status === "unreachable") return <Unreachable />;
  const me = state.status === "signedIn" ? state.me : null;
  const needsLegal = me?.missingSteps.includes("legal") ?? false;
  const needsProfile = me?.missingSteps.includes("profile") ?? false;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="coming-soon" />
      <Stack.Screen name="legal/[type]" />
      <Stack.Protected guard={me === null}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={me !== null}>
        <Stack.Screen name="settings" />
      </Stack.Protected>
      <Stack.Protected guard={needsLegal}>
        <Stack.Screen name="onboarding/terms" />
      </Stack.Protected>
      <Stack.Protected guard={me !== null && !needsLegal && needsProfile}>
        <Stack.Screen name="onboarding/profile" />
      </Stack.Protected>
      <Stack.Protected guard={me !== null && !needsLegal && !needsProfile}>
        <Stack.Screen name="profile/index" />
        <Stack.Screen name="profile/edit" />
      </Stack.Protected>
    </Stack>
  );
}

/** The API could not be reached at start; the person is not signed out. */
function Unreachable() {
  const { t } = useLanguage();
  const session = useSession();
  return (
    <Screen>
      <Notice message={t("error.network_error")} />
      <Button label={t("common.retry")} onPress={() => void session.restore()} />
    </Screen>
  );
}

/**
 * Shown when a screen breaks: the error is reported, and the person can try
 * again. It replaces the whole app, so it brings its own providers; the
 * language is the one the person chose.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error);
  }, [error]);
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <UnexpectedError retry={retry} />
      </LanguageProvider>
    </SafeAreaProvider>
  );
}

function UnexpectedError({ retry }: { readonly retry: ErrorBoundaryProps["retry"] }) {
  const { t } = useLanguage();
  return (
    <Screen>
      <Title>{t("error.unexpected_title")}</Title>
      <Body>{t("error.unexpected_body")}</Body>
      <Button label={t("common.retry")} onPress={() => void retry()} />
    </Screen>
  );
}
