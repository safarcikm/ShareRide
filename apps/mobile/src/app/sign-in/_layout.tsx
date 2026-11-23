import { Stack, useGlobalSearchParams, useSegments } from "expo-router";
import { useMe } from "@/auth/session";
import { BackToMenu } from "@/navigation/back-to-menu";
import { SignInFlowProvider } from "@/sign-in/flow";

/**
 * Email and its code, then the phone number, country picker, code and, for
 * a new account while the beta is closed, the invite code (spec 1, screens
 * 2 and 3; spec 12, 3.2.3; spec 26).
 * An invite link opens it with `?invite=` and the code is kept from there.
 * Once signed in, sign-in closes back to the menu; but not the page Google's
 * or Apple's window comes back to, which a signed-in person adding one in
 * Settings sees too (spec 19, 3.4).
 */
export default function SignInLayout() {
  const { invite } = useGlobalSearchParams<{ invite?: string }>();
  const returning = useSegments().at(-1) === "return";
  if (useMe() !== null && !returning) return <BackToMenu />;
  return (
    <SignInFlowProvider inviteCode={typeof invite === "string" ? invite : ""}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="email-code" />
        <Stack.Screen name="country" options={{ presentation: "modal" }} />
        <Stack.Screen name="code" />
        <Stack.Screen name="invite" />
        <Stack.Screen name="return" />
      </Stack>
    </SignInFlowProvider>
  );
}
