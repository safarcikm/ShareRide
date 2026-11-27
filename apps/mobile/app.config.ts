// app.json holds the app's settings; this adds the ones that come from the
// build:
// - Firebase's google-services.json for push on Android, which EAS gives the
//   build as the GOOGLE_SERVICES_JSON file variable (ADR 0026,
//   docs/operations/app-builds.md). The file is never in the repository.
//   Without it the app builds and runs, and Android has no push.
// - For the phone journeys in CI only (E2E_CLEARTEXT=1, spec 32, 3.7): the
//   Android release build may reach the test API on the CI machine over
//   plain http. Every other build talks HTTPS only (R32.1). The iPhone
//   simulator reaches localhost through App Transport Security's local
//   networking exception, which Expo sets.
import type { ConfigContext, ExpoConfig } from "expo/config";
import { withAndroidManifest, type AndroidManifest } from "expo/config-plugins";

// Expo's types leave process.env untyped.
const env = process.env as Record<string, string | undefined>;

/** The manifest with plain http allowed, for the CI build only. */
export function allowHttp(manifest: AndroidManifest): AndroidManifest {
  for (const application of manifest.manifest.application ?? []) {
    application.$["android:usesCleartextTraffic"] = "true";
  }
  return manifest;
}

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const googleServicesFile = env["GOOGLE_SERVICES_JSON"];
  const app: ExpoConfig = {
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
  if (env["E2E_CLEARTEXT"] !== "1") return app;
  return withAndroidManifest(app, (manifest) => {
    manifest.modResults = allowHttp(manifest.modResults);
    return manifest;
  });
}
