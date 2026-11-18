import { Stack, type ErrorBoundaryProps } from "expo-router";
import { useEffect, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession, useSessionState } from "@/auth/session";
import { ConfigProvider } from "@/beta/config";
import { UnreadProvider } from "@/chat/unread";
import { Button } from "@/components/button";
import { Loading } from "@/components/loading";
import { Notice } from "@/components/notice";
import { Screen, ScreenEdges, useWideScreen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { LanguageProvider, useLanguage } from "@/i18n/language";
import { useSaveLanguage } from "@/i18n/use-save-language";
import { reportError, startErrorReporting } from "@/lib/error-reporting";
import { PushNotifications } from "@/notifications/push-notifications";
import { useAppFonts } from "@/theme/fonts";
import { TopBar } from "@/navigation/top-bar";
import { installFocusRing } from "@/theme/focus-ring";

startErrorReporting();
installFocusRing();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <SessionProvider>
          <ConfigProvider>
            <UnreadProvider>
              <Navigation />
              <PushNotifications />
            </UnreadProvider>
          </ConfigProvider>
        </SessionProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}

/**
 * Which screens can open depends on the session: a new account goes
 * through step 3, about you, with the terms in it, before the rest; an
 * account whose terms changed sees only the terms (spec 16, 3.5); an
 * account waiting to be deleted sees only when it goes, with "Keep my
 * account" (spec 11, 3.4.4). When the
 * session changes (signed in, a step done, signed out, or the session ended
 * elsewhere), screens that no longer fit close and the app returns to the
 * start, which leads on from there. Sign-in and Settings,
 * where the session changes, close themselves back to the menu instead: a
 * guard would open a second menu on top of the first. Fonts load at the same
 * time; if they fail, the app opens with the system fonts. Wide screens show
 * the menu in a bar above every screen (spec 16, 3.1).
 */
function Navigation() {
  const state = useSessionState();
  // Fonts load while the session is restored; both finish behind Loading.
  const fontsReady = useAppFonts();
  if (state.status === "loading" || !fontsReady) return <Loading />;
  if (state.status === "unreachable") return <Unreachable />;
  const me = state.status === "signedIn" ? state.me : null;
  const deleting = me !== null && me.deletionScheduledFor !== null;
  const needsLegal = !deleting && (me?.missingSteps.includes("legal") ?? false);
  const needsProfile = !deleting && (me?.missingSteps.includes("profile") ?? false);
  const stack = (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="coming-soon" />
      <Stack.Screen name="legal/index" />
      <Stack.Screen name="legal/[type]" />
      <Stack.Screen name="meeting-points/index" />
      <Stack.Screen name="meeting-points/[id]/index" />
      {/* Signed out, it asks to sign in first. */}
      <Stack.Screen name="meeting-points/[id]/problem" />
      <Stack.Screen name="places/[id]" />
      <Stack.Screen name="rides/index" />
      <Stack.Screen name="search/index" />
      <Stack.Screen name="search/results" />
      <Stack.Screen name="trips/[id]/index" />
      {/* Sign-in and Settings close themselves when the session changes (BackToMenu). */}
      <Stack.Screen name="sign-in" />
      {/* An invite link: on to sign-in with its code. */}
      <Stack.Screen name="invite/[code]" />
      {/* Open signed in or out, but not while an account waits to be deleted. */}
      <Stack.Protected guard={!deleting}>
        <Stack.Screen name="settings" />
        <Stack.Screen name="settings/email" />
        <Stack.Screen name="settings/privacy/index" />
        <Stack.Screen name="settings/privacy/download" />
        <Stack.Screen name="settings/privacy/delete" />
        <Stack.Screen name="messages/[bookingId]" />
        <Stack.Screen name="verify-email" />
      </Stack.Protected>
      <Stack.Protected guard={deleting}>
        <Stack.Screen name="account/deletion" />
      </Stack.Protected>
      <Stack.Protected guard={me !== null && needsProfile}>
        <Stack.Screen name="onboarding/about-you" />
      </Stack.Protected>
      <Stack.Protected guard={needsLegal && !needsProfile}>
        <Stack.Screen name="onboarding/terms" />
      </Stack.Protected>
      <Stack.Protected guard={me !== null && !deleting && !needsLegal && !needsProfile}>
        <Stack.Screen name="profile/edit" />
        <Stack.Screen name="profile/preview" />
        <Stack.Screen name="people/[profileId]" />
        <Stack.Screen name="drive/cars/index" />
        <Stack.Screen name="drive/cars/new" />
        <Stack.Screen name="drive/cars/[id]" />
        <Stack.Screen name="drive/licence" />
        <Stack.Screen name="drive/trips/index" />
        <Stack.Screen name="drive/trips/new" />
        <Stack.Screen name="drive/trips/[id]/index" />
        <Stack.Screen name="drive/trips/[id]/route" />
        <Stack.Screen name="drive/trips/[id]/time" />
        <Stack.Screen name="drive/trips/[id]/price" />
        <Stack.Screen name="drive/trips/[id]/seats" />
        <Stack.Screen name="drive/trips/[id]/review" />
        <Stack.Screen name="drive/trips/[id]/published" />
        <Stack.Screen name="drive/trips/[id]/message" />
        <Stack.Screen name="drive/trips/[id]/cancel" />
        <Stack.Screen name="drive/trips/[id]/edit/index" />
        <Stack.Screen name="drive/trips/[id]/edit/time" />
        <Stack.Screen name="drive/trips/[id]/edit/price" />
        <Stack.Screen name="drive/trips/[id]/edit/seats" />
        <Stack.Screen name="drive/trips/[id]/edit/car" />
        <Stack.Screen name="drive/trips/[id]/edit/stop" />
        <Stack.Screen name="drive/trips/[id]/edit/remove-stop" />
        <Stack.Screen name="drive/trips/[id]/edit/booking" />
        <Stack.Screen name="drive/trips/[id]/edit/details" />
        <Stack.Screen name="drive/trips/[id]/edit/check" />
        <Stack.Screen name="trips/[id]/book" />
        <Stack.Screen name="bookings/[id]/index" />
        <Stack.Screen name="bookings/[id]/booked" />
        <Stack.Screen name="bookings/[id]/cancel" />
        <Stack.Screen name="bookings/[id]/no-show" />
        <Stack.Screen name="bookings/[id]/driver-absent" />
        <Stack.Screen name="bookings/[id]/answer" />
        <Stack.Screen name="bookings/[id]/rate" />
      </Stack.Protected>
    </Stack>
  );
  return <WithTopBar>{stack}</WithTopBar>;
}

/**
 * On wide screens, the top bar above every screen, which then leave its edge
 * to it. The screens stay in the same place in the tree either way, so a
 * window turning wide or narrow keeps what they show.
 */
function WithTopBar({ children }: { readonly children: ReactNode }) {
  const wide = useWideScreen();
  const saveLanguage = useSaveLanguage();
  return (
    <View style={styles.frame}>
      {wide ? <TopBar onSwitchLanguage={saveLanguage} /> : null}
      <ScreenEdges value={wide ? belowTopBar : allEdges}>{children}</ScreenEdges>
    </View>
  );
}

const belowTopBar = ["right", "bottom", "left"] as const;
const allEdges = ["top", "right", "bottom", "left"] as const;

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

const styles = StyleSheet.create({ frame: { flex: 1 } });

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
