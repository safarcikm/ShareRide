import { describe, expect, it } from "vitest";
import { clientAddress } from "./client-address.ts";

describe("clientAddress", () => {
  it("uses the connection's address when there is no trusted proxy", () => {
    expect(
      clientAddress({ remote: "203.0.113.5", forwardedFor: "198.51.100.1", trustProxy: false }),
    ).toBe("203.0.113.5");
  });

  it("uses the address the trusted proxy added last, which a client cannot forge", () => {
    expect(
      clientAddress({
        remote: "10.0.0.2",
        forwardedFor: "198.51.100.66, 203.0.113.5",
        trustProxy: true,
      }),
    ).toBe("203.0.113.5");
  });

  it("falls back to the connection when the proxy header is missing", () => {
    expect(clientAddress({ remote: "10.0.0.2", forwardedFor: undefined, trustProxy: true })).toBe(
      "10.0.0.2",
    );
  });

  it("says unknown when there is no address at all", () => {
    expect(clientAddress({ remote: undefined, forwardedFor: undefined, trustProxy: false })).toBe(
      "unknown",
    );
  });
});
