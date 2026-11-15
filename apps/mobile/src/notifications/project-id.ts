import Constants from "expo-constants";

/**
 * The expo.dev project the app belongs to, which a push token needs (plan
 * 4.5): from the build, or from `extra.eas.projectId` in app.json. None
 * until the project is set up, and then the app registers no token.
 */
export function projectId(): string | undefined {
  const { easConfig, expoConfig } = Constants as unknown as {
    readonly easConfig?: { readonly projectId?: unknown } | null;
    readonly expoConfig?: {
      readonly extra?: { readonly eas?: { readonly projectId?: unknown } };
    } | null;
  };
  const found = easConfig?.projectId ?? expoConfig?.extra?.eas?.projectId;
  return typeof found === "string" && found !== "" ? found : undefined;
}
