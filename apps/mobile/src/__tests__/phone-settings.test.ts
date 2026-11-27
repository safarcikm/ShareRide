// What the phone apps ask for and where they run (spec 32, section 3.1 and
// the table of findings): Apple and Google read these from the built app,
// and a permission the app does not use is a question the reviewers ask
// and a line in the privacy answers. Checked against `expo config --type
// introspect`, which shows the Info.plist and Android manifest these make.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const read = (file: string): unknown =>
  JSON.parse(readFileSync(join(root, file), "utf8")) as unknown;

type Plugin = string | readonly [string, Readonly<Record<string, unknown>>];

const app = (
  read("app.json") as {
    readonly expo: {
      readonly userInterfaceStyle: string;
      readonly ios: Readonly<Record<string, unknown>>;
      readonly android: { readonly blockedPermissions?: readonly string[] };
      readonly plugins: readonly Plugin[];
    };
  }
).expo;
const dependencies = (read("package.json") as { readonly dependencies: Record<string, string> })
  .dependencies;

/** A plugin's options in app.json, or undefined when it has none. */
function optionsOf(name: string): Readonly<Record<string, unknown>> | undefined {
  const entry = app.plugins.find((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === name);
  return Array.isArray(entry) ? (entry[1] as Readonly<Record<string, unknown>>) : undefined;
}

describe("The phone apps' settings", () => {
  it("follow the phone's dark mode on Android too, which needs expo-system-ui", () => {
    expect(app.userInterfaceStyle).toBe("automatic");
    expect(dependencies).toHaveProperty("expo-system-ui");
  });

  it("ask for no Face ID: the app keeps its sign-in without it", () => {
    expect(optionsOf("expo-secure-store")).toEqual({ faceIDPermission: false });
  });

  it("ask for no motion data: shaking for feedback reads the accelerometer, which needs none", () => {
    expect(optionsOf("expo-sensors")).toEqual({ motionPermission: false });
  });

  it("cannot draw over other apps on Android", () => {
    expect(app.android.blockedPermissions).toContain("android.permission.SYSTEM_ALERT_WINDOW");
  });

  it("are an iPhone app, not an iPad one, for now", () => {
    expect(app.ios["supportsTablet"]).toBe(false);
  });
});
