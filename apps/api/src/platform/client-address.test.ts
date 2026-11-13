import { describe, expect, it } from "vitest";
import { clientAddress } from "./client-address.ts";

describe("clientAddress", () => {
  it("uses the connection's address when there is no trusted proxy", () => {
    expect(
      clientAddress({ remote: "203.0.113.5", forwardedFor: "198.51.100.1", trustedProxies: 0 }),
    ).toEqual({ address: "203.0.113.5", source: "connection" });
  });

  it("uses the address the trusted proxy added last, which a client cannot forge", () => {
    expect(
      clientAddress({
        remote: "10.0.0.2",
        forwardedFor: "198.51.100.66, 203.0.113.5",
        trustedProxies: 1,
      }),
    ).toEqual({ address: "203.0.113.5", source: "proxy" });
  });

  it("counts back one entry per trusted proxy, as on Render behind Cloudflare", () => {
    // A forged entry, then the client as Cloudflare appended it, then the
    // Cloudflare edge as Render's proxy appended it.
    const forwardedFor = "198.51.100.66, 203.0.113.5, 104.22.17.40";
    expect(clientAddress({ remote: "10.0.0.2", forwardedFor, trustedProxies: 2 })).toEqual({
      address: "203.0.113.5",
      source: "proxy",
    });
    expect(
      clientAddress({
        remote: "10.0.0.2",
        forwardedFor: "2001:db8::5,104.22.17.40",
        trustedProxies: 2,
      }),
    ).toEqual({ address: "2001:db8::5", source: "proxy" });
  });

  it("falls back to the connection when the proxies' entries are missing or not addresses", () => {
    for (const forwardedFor of [undefined, "", "203.0.113.5", "not-an-address, 104.22.17.40"]) {
      expect(clientAddress({ remote: "10.0.0.2", forwardedFor, trustedProxies: 2 })).toEqual({
        address: "10.0.0.2",
        source: "connection",
      });
    }
  });

  it("says unknown when there is no address at all", () => {
    expect(
      clientAddress({ remote: undefined, forwardedFor: undefined, trustedProxies: 0 }),
    ).toEqual({ address: "unknown", source: "connection" });
  });
});
