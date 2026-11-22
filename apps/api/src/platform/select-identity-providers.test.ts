import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { selectSignIn } from "./select-identity-providers.ts";

const apiOrigin = "https://staging.skinnar.is";
const returnOrigins = ["https://staging.skinnar.is"];
const authorization = {
  state: "s",
  nonce: "n",
  codeVerifier: "v".repeat(43),
  redirectUri: `${apiOrigin}/v1/auth/oauth/apple/callback`,
};

describe("selectSignIn (ADR 0034)", () => {
  it("turns on nothing while both are off", () => {
    expect(
      selectSignIn({
        google: { mode: "off" },
        apple: { mode: "off" },
        apiOrigin,
        returnOrigins,
        allowExpoGo: false,
      }).providers,
    ).toEqual([]);
  });

  it("uses the stand-ins in development", () => {
    const { providers } = selectSignIn({
      google: { mode: "dev" },
      apple: { mode: "dev" },
      apiOrigin: "http://localhost:3000",
      returnOrigins: ["http://localhost:8081"],
      allowExpoGo: true,
    });
    expect(providers.map((provider) => [provider.name, provider.development])).toEqual([
      ["google", true],
      ["apple", true],
    ]);
  });

  it("signs in with the real Google and Apple, each with its own identifiers", () => {
    const privateKey = generateKeyPairSync("ec", {
      namedCurve: "P-256",
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    }).privateKey;
    const { providers, returnUrls } = selectSignIn({
      google: { mode: "google", clientId: "client.apps.googleusercontent.com", clientSecret: "s" },
      apple: {
        mode: "apple",
        servicesId: "is.shareride.preview.web",
        teamId: "TEAM123456",
        keyId: "KEY1234567",
        privateKey,
      },
      apiOrigin,
      returnOrigins,
      allowExpoGo: false,
    });
    expect(providers.map((provider) => [provider.name, provider.development])).toEqual([
      ["google", undefined],
      ["apple", undefined],
    ]);
    const clientIds = providers.map((provider) =>
      new URL(provider.authorizationUrl(authorization)).searchParams.get("client_id"),
    );
    expect(clientIds).toEqual(["client.apps.googleusercontent.com", "is.shareride.preview.web"]);
    expect(returnUrls).toEqual({
      webOrigins: returnOrigins,
      appScheme: "shareride",
      allowExpoGo: false,
    });
  });
});
