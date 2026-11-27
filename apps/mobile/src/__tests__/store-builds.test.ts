// The builds Expo makes in its cloud (EAS Build), spec 32, sections 3.1 and
// 3.7: the store builds talk only to puffinride.is (R32.1) and go to the
// stores' test tracks as drafts, never to the public (R32.2); the team's
// staging build is an Android file to install by hand. A build that passes
// here but differs there fails in Expo's cloud or reaches the wrong API.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const read = (...path: string[]): unknown =>
  JSON.parse(readFileSync(join(root, ...path), "utf8")) as unknown;

interface Profile {
  readonly extends?: string;
  readonly distribution?: string;
  readonly environment?: string;
  readonly channel?: string;
  readonly node?: string;
  readonly pnpm?: string;
  readonly autoIncrement?: boolean;
  readonly env?: Readonly<Record<string, string>>;
  readonly android?: { readonly buildType?: string };
  readonly ios?: Readonly<Record<string, unknown>>;
}

interface Submit {
  readonly ios?: Readonly<Record<string, unknown>>;
  readonly android?: { readonly track?: string; readonly releaseStatus?: string };
}

const eas = read("eas.json") as {
  readonly cli: { readonly appVersionSource?: string };
  readonly build: Readonly<Record<string, Profile>>;
  readonly submit: Readonly<Record<string, Submit>>;
};
const app = (
  read("app.json") as {
    readonly expo: {
      readonly version: string;
      readonly owner?: string;
      readonly runtimeVersion?: unknown;
      readonly updates?: { readonly url?: string };
      readonly extra?: { readonly eas?: { readonly projectId?: string } };
      readonly ios: Readonly<Record<string, unknown>>;
      readonly android: Readonly<Record<string, unknown>>;
    };
  }
).expo;
const workspace = read("..", "..", "package.json") as { readonly packageManager: string };
const nodeMajor = readFileSync(join(root, "..", "..", ".nvmrc"), "utf8")
  .trim()
  .replace(/^v/, "");

// The expo.dev project, made by Martin on 2026-11-27 (not a secret).
const expoProject = "59be70df-a793-46df-9e42-b3a592af7549";

describe("The store builds", () => {
  const production = eas.build["production"];

  it("talk to puffinride.is over HTTPS, with Expo's production settings", () => {
    expect(production?.extends).toBeUndefined();
    expect(production?.environment).toBe("production");
    expect(production?.env).toEqual({
      EXPO_PUBLIC_API_URL: "https://puffinride.is",
      EXPO_PUBLIC_APP_ENV: "production",
    });
  });

  it("are signed for the stores, with build numbers counted by Expo", () => {
    expect(production?.distribution ?? "store").toBe("store");
    expect(production?.android?.buildType ?? "app-bundle").toBe("app-bundle");
    expect(production?.autoIncrement).toBe(true);
    expect(eas.cli.appVersionSource).toBe("remote");
  });

  it("take over-the-air fixes from the production channel only", () => {
    expect(production?.channel).toBe("production");
  });

  it("go to TestFlight and to Google Play's internal testing as a draft, never further", () => {
    expect(eas.submit["production"]?.android).toEqual({
      track: "internal",
      releaseStatus: "draft",
    });
    expect(Object.keys(eas.submit)).toEqual(["production"]);
  });

  it("build with the repository's Node.js and pnpm", () => {
    expect(production?.node?.split(".")[0]).toBe(nodeMajor);
    expect(`pnpm@${production?.pnpm ?? ""}`).toBe(workspace.packageManager);
  });

  it("are the only builds signed for a store (R32.1)", () => {
    for (const [name, profile] of Object.entries(eas.build)) {
      const store = (profile.distribution ?? "store") === "store";
      expect([name, store]).toEqual([name, name === "production"]);
    }
  });
});

describe("The team's staging build", () => {
  const preview = eas.build["preview"];

  it("is an Android file to install by hand, talking to staging", () => {
    expect(preview?.distribution).toBe("internal");
    expect(preview?.android?.buildType).toBe("apk");
    expect(preview?.environment).toBe("preview");
    expect(preview?.channel).toBe("preview");
    expect(preview?.env).toEqual({
      EXPO_PUBLIC_API_URL: "https://staging.puffinride.is",
      EXPO_PUBLIC_APP_ENV: "staging",
    });
  });

  it("builds with the same tools as the store builds", () => {
    expect(preview?.node).toBe(eas.build["production"]?.node);
    expect(preview?.pnpm).toBe(eas.build["production"]?.pnpm);
  });
});

describe("The app the builds make", () => {
  it("is is.puffinride.app on both stores, version 1.0.0", () => {
    expect(app.ios["bundleIdentifier"]).toBe("is.puffinride.app");
    expect(app.android["package"]).toBe("is.puffinride.app");
    expect(app.version).toBe("1.0.0");
  });

  it("belongs to the expo.dev project of the puffinride.is account", () => {
    expect(app.owner).toBe("puffinride.is");
    expect(app.extra?.eas?.projectId).toBe(expoProject);
  });

  it("takes over-the-air fixes from that project, only for its own version", () => {
    expect(app.updates?.url).toBe(`https://u.expo.dev/${expoProject}`);
    expect(app.runtimeVersion).toEqual({ policy: "appVersion" });
  });

  it("declares only standard encryption (HTTPS)", () => {
    expect(app.ios).toHaveProperty("config.usesNonExemptEncryption", false);
  });
});
