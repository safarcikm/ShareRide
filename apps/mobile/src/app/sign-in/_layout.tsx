import { Stack, useGlobalSearchParams } from "expo-router";
import { useMe } from "@/auth/session";
import { BackToMenu } from "@/navigation/back-to-menu";
import { SignInFlowProvider } from "@/sign-in/flow";

/**
 * Phone number, country picker, code and, for a new account while the beta
 * is closed, the invite code (spec 1, screens 2 and 3; spec 12, 3.2.3).
 * An invite link opens it with `?invite=` and the code is kept from there.
 * Once signed in, sign-in closes back to the menu.
 */
export default function SignInLayout() {
  const { invite } = useGlobalSearchParams<{ invite?: string }>();
  if (useMe() !== null) return <BackToMenu />;
  return (
    <SignInFlowProvider inviteCode={typeof invite === "string" ? invite : ""}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="country" options={{ presentation: "modal" }} />
        <Stack.Screen name="code" />
        <Stack.Screen name="invite" />
      </Stack>
    </SignInFlowProvider>
  );
}
