import { firstWay } from "./last-used";

// The way used last time first (spec 29, 3.5).

const all = { providers: ["google", "apple"] as const, passkey: true, email: true };

describe("firstWay", () => {
  it.each(["google", "apple", "passkey", "password", "email"] as const)(
    "puts %s first when the screen offers it",
    (way) => {
      expect(firstWay(way, all)).toBe(way);
    },
  );

  it("keeps today's order when nothing is kept", () => {
    expect(firstWay(null, all)).toBeNull();
  });

  it.each<[string, Parameters<typeof firstWay>[0], Parameters<typeof firstWay>[1]]>([
    ["Google switched off", "google", { ...all, providers: ["apple"] }],
    ["Apple not set up", "apple", { ...all, providers: [] }],
    ["a device without Face ID", "passkey", { ...all, passkey: false }],
    ["no email sign-in", "email", { ...all, email: false }],
    ["no form for a password", "password", { ...all, email: false }],
  ])("keeps today's order with %s", (_name, way, offered) => {
    expect(firstWay(way, offered)).toBeNull();
  });
});
