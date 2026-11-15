import { Stack } from "expo-router";
import { useMe } from "@/auth/session";
import { BackToMenu } from "@/navigation/back-to-menu";
import { SignInFlowProvider } from "@/sign-in/flow";

/**
 * Phone number, country picker and code (spec 1, screens 2 and 3). Once
 * signed in, sign-in closes back to the menu.
 */
export default function SignInLayout() {
  if (useMe() !== null) return <BackToMenu />;
  return (
    <SignInFlowProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="country" options={{ presentation: "modal" }} />
        <Stack.Screen name="code" />
      </Stack>
    </SignInFlowProvider>
  );
}
