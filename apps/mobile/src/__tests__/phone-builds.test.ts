// The phone journeys (apps/mobile/maestro, spec 32, 3.7) run a release build
// against the test API on the CI machine, over plain http. Only that build
// may allow it: a store build talks HTTPS only (R32.1).
import type { ConfigContext, ExpoConfig } from "expo/config";
import type { AndroidManifest } from "expo/config-plugins";
import appConfig, { allowHttp } from "../../app.config";

const context = {
  config: { name: "PuffinRide", slug: "puffinride", android: { package: "is.puffinride.app" } },
} as unknown as ConfigContext;

const manifest = (): AndroidManifest => ({
  manifest: {
    $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
    queries: [],
    application: [{ $: { "android:name": ".MainApplication" } }],
  },
});

/** The Android manifest step the config adds, if any (Expo's type leaves `mods` out). */
const manifestMod = (config: ExpoConfig): unknown =>
  (config as { mods?: { android?: { manifest?: unknown } } }).mods?.android?.manifest;

// Expo's types leave process.env untyped; app.config.ts reads it the same way.
const env = process.env as Record<string, string | undefined>;

describe("The build the phone journeys run", () => {
  const before = env["E2E_CLEARTEXT"];
  afterEach(() => {
    if (before === undefined) delete env["E2E_CLEARTEXT"];
    else env["E2E_CLEARTEXT"] = before;
  });

  it("changes nothing in the Android manifest of any other build", () => {
    delete env["E2E_CLEARTEXT"];
    expect(manifestMod(appConfig(context))).toBeUndefined();
    env["E2E_CLEARTEXT"] = "true";
    expect(manifestMod(appConfig(context))).toBeUndefined();
  });

  it("lets the CI build reach the test API over http when E2E_CLEARTEXT is 1", () => {
    env["E2E_CLEARTEXT"] = "1";
    expect(manifestMod(appConfig(context))).toBeInstanceOf(Function);
  });

  it("allows plain http in the app's manifest, and keeps what was there", () => {
    const changed = allowHttp(manifest());
    expect(changed.manifest.application?.[0]?.$).toEqual({
      "android:name": ".MainApplication",
      "android:usesCleartextTraffic": "true",
    });
  });
});
