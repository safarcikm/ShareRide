// The iPhone builds Expo makes in its cloud (EAS Build) for TestFlight:
// they must talk to staging over HTTPS and match the tools the repository
// pins, or a build that passes here fails there or reaches the wrong API.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const read = (...path: string[]): unknown =>
  JSON.parse(readFileSync(join(root, ...path), "utf8")) as unknown;

interface Profile {
  readonly distribution?: string;
  readonly environment?: string;
  readonly node?: string;
  readonly pnpm?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly ios?: { readonly autoIncrement?: boolean | string };
}

const eas = read("eas.json") as {
  readonly cli: { readonly appVersionSource?: string };
  readonly build: Readonly<Record<string, Profile>>;
  readonly submit: Readonly<Record<string, { readonly ios?: { readonly appName?: string } }>>;
};
const app = read("app.json") as {
  readonly expo: { readonly ios: Readonly<Record<string, unknown>> };
};
const workspace = read("..", "..", "package.json") as { readonly packageManager: string };
const nodeMajor = readFileSync(join(root, "..", "..", ".nvmrc"), "utf8")
  .trim()
  .replace(/^v/, "");

describe("The iPhone preview build", () => {
  const preview = eas.build["preview"];

  it("goes to TestFlight, with build numbers kept by EAS", () => {
    expect(preview?.distribution ?? "store").toBe("store");
    expect(preview?.ios?.autoIncrement).toBe(true);
    expect(eas.cli.appVersionSource).toBe("remote");
    expect(eas.submit).toHaveProperty("preview");
  });

  it("has its own name in App Store Connect, leaving ShareRide for the store app", () => {
    expect(eas.submit["preview"]?.ios?.appName).toBe("ShareRide Preview");
  });

  it("talks to staging over HTTPS, with Expo's preview settings, not production's", () => {
    expect(preview?.environment).toBe("preview");
    expect(preview?.env?.["EXPO_PUBLIC_API_URL"]).toMatch(/^https:\/\/[^/]+$/);
    expect(preview?.env?.["EXPO_PUBLIC_APP_ENV"]).toBe("staging");
  });

  it("builds with the repository's Node.js and pnpm", () => {
    expect(preview?.node?.split(".")[0]).toBe(nodeMajor);
    expect(`pnpm@${preview?.pnpm ?? ""}`).toBe(workspace.packageManager);
  });

  it("has its own app ID and declares only standard encryption (HTTPS)", () => {
    expect(app.expo.ios["bundleIdentifier"]).toBe("is.shareride.app.preview");
    expect(app.expo.ios).toHaveProperty("config.usesNonExemptEncryption", false);
  });
});
