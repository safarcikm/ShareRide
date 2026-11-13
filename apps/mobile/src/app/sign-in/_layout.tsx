import { Stack } from "expo-router";
import { SignInFlowProvider } from "@/sign-in/flow";

/** Phone number, country picker and code (spec 1, screens 2 and 3). */
export default function SignInLayout() {
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
