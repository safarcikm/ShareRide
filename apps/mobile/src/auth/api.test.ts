import { chooseApiBaseUrl } from "./api";

describe("chooseApiBaseUrl", () => {
  it("uses the address set at build time when there is one", () => {
    expect(
      chooseApiBaseUrl({
        configured: "https://api.example.test",
        platform: "web",
        development: false,
        pageOrigin: "https://app.example.test",
      }),
    ).toBe("https://api.example.test");
  });

  it("uses the page's own origin for a web build, where the API serves the app", () => {
    expect(
      chooseApiBaseUrl({
        configured: undefined,
        platform: "web",
        development: false,
        pageOrigin: "https://shareride-staging.onrender.com",
      }),
    ).toBe("https://shareride-staging.onrender.com");
  });

  it("uses the local API in development on the web", () => {
    expect(
      chooseApiBaseUrl({
        configured: "",
        platform: "web",
        development: true,
        pageOrigin: "http://localhost:8081",
      }),
    ).toBe("http://localhost:3000");
  });

  it("finds the API on the computer running Expo, for Expo Go on a phone", () => {
    expect(
      chooseApiBaseUrl({
        configured: undefined,
        platform: "ios",
        development: true,
        expoHost: "192.168.1.20:8081",
      }),
    ).toBe("http://192.168.1.20:3000");
    expect(
      chooseApiBaseUrl({ configured: undefined, platform: "android", development: true }),
    ).toBe("http://localhost:3000");
  });
});
