import { createHash } from "node:crypto";
import type * as NodeCrypto from "node:crypto";
import { openAuthSessionAsync, windowReturnsTo } from "@/testing/web-browser";
import { makeAttempt, openProviderWindow, readReturn } from "./provider-window";

// Jest has no SHA-256 of its own behind expo-crypto: Node's stands in.
jest.mock("expo-crypto", () => {
  const { createHash: hash } = jest.requireActual<typeof NodeCrypto>("node:crypto");
  return {
    ...jest.requireActual<object>("expo-crypto"),
    digestStringAsync: (_algorithm: string, data: string) =>
      Promise.resolve(hash("sha256").update(data).digest("base64")),
  };
});

const ticket = `sr_pt_${"t".repeat(43)}`;
const returnUrl = "https://web.test/sign-in/return";

describe("makeAttempt", () => {
  it("makes a secret and its SHA-256 in base64url, new each time", async () => {
    const first = await makeAttempt();
    const second = await makeAttempt();
    expect(first.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.challenge).toBe(createHash("sha256").update(first.verifier).digest("base64url"));
    expect(second.verifier).not.toBe(first.verifier);
  });
});

describe("readReturn", () => {
  it("takes the ticket from the address's fragment", () => {
    expect(readReturn(`${returnUrl}#ticket=${ticket}`)).toEqual({ kind: "ticket", ticket });
    expect(readReturn(`shareride://sign-in/return#ticket=${ticket}`)).toEqual({
      kind: "ticket",
      ticket,
    });
  });

  it("reads what went wrong, and anything else as failed", () => {
    expect(readReturn(`${returnUrl}#error=cancelled`)).toEqual({ kind: "cancelled" });
    expect(readReturn(`${returnUrl}#error=expired`)).toEqual({ kind: "expired" });
    expect(readReturn(`${returnUrl}#error=failed`)).toEqual({ kind: "failed" });
    expect(readReturn(`${returnUrl}#error=something`)).toEqual({ kind: "failed" });
    expect(readReturn(returnUrl)).toEqual({ kind: "failed" });
    expect(readReturn(`${returnUrl}#ticket=sr_pt_short`)).toEqual({ kind: "failed" });
    // Never from the query: the API puts the ticket in the fragment only.
    expect(readReturn(`${returnUrl}?ticket=${ticket}`)).toEqual({ kind: "failed" });
  });
});

describe("openProviderWindow", () => {
  const attempt = { verifier: "v".repeat(43), challenge: "c".repeat(43) };
  const open = (provider: "google" | "apple" = "google") =>
    openProviderWindow({ provider, attempt, apiBaseUrl: "https://api.test", returnUrl });

  it("opens the API's start with the challenge and the return address", async () => {
    windowReturnsTo(`${returnUrl}#ticket=${ticket}`);
    expect(await open("apple")).toEqual({ kind: "ticket", ticket, verifier: attempt.verifier });
    expect(openAuthSessionAsync).toHaveBeenLastCalledWith(
      `https://api.test/v1/auth/oauth/apple/start?challenge=${"c".repeat(43)}&returnUrl=https%3A%2F%2Fweb.test%2Fsign-in%2Freturn`,
      returnUrl,
    );
  });

  it("is cancelled when the person closes the window", async () => {
    windowReturnsTo(null);
    expect(await open()).toEqual({ kind: "cancelled" });
  });

  it("failed when the window cannot open, such as a blocked pop-up", async () => {
    openAuthSessionAsync.mockImplementationOnce(() => {
      throw new Error("ERR_WEB_BROWSER_BLOCKED");
    });
    expect(await open()).toEqual({ kind: "failed" });
  });
});
