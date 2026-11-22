// The app's names in the stores, on phones and in links (ADR 0039): they
// say PuffinRide and can no longer change once the app is in a store.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const app = JSON.parse(readFileSync(join(__dirname, "..", "..", "app.json"), "utf8")) as {
  readonly expo: {
    readonly name: string;
    readonly slug: string;
    readonly scheme: string;
    readonly ios: { readonly bundleIdentifier: string };
    readonly android: { readonly package: string };
  };
};

describe("The app's identity", () => {
  it("is called PuffinRide, with the slug and link scheme puffinride", () => {
    expect(app.expo.name).toBe("PuffinRide");
    expect(app.expo.slug).toBe("puffinride");
    expect(app.expo.scheme).toBe("puffinride");
  });

  it("uses the is.puffinride app IDs, the iPhone preview under its own", () => {
    expect(app.expo.ios.bundleIdentifier).toBe("is.puffinride.app.preview");
    expect(app.expo.android.package).toBe("is.puffinride.app");
  });
});
