// app.json holds the app's settings; this adds the one that comes from the
// build: Firebase's google-services.json for push on Android, which EAS
// gives the build as the GOOGLE_SERVICES_JSON file variable (ADR 0026,
// docs/operations/app-builds.md). The file is never in the repository.
// Without it the app builds and runs, and Android has no push.
import type { ConfigContext, ExpoConfig } from "expo/config";

// Expo's types leave process.env untyped.
const env = process.env as Record<string, string | undefined>;

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const googleServicesFile = env["GOOGLE_SERVICES_JSON"];
  return {
    ...config,
    name: config.name ?? "PuffinRide",
    slug: config.slug ?? "puffinride",
    android: {
      ...config.android,
      ...(googleServicesFile === undefined || googleServicesFile === ""
        ? {}
        : { googleServicesFile }),
    },
  };
}
