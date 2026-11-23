import { keepPendingBooking } from "@/booking/pending-booking";
import { keepPendingOffer } from "@/drive/pending-offer";
import { keepPendingProblem } from "@/meeting-points/pending-problem";
import { takeKeptChoice } from "./kept-choice";
import {
  forgetPendingLink,
  keepPendingLink,
  keepPendingLinkIfNone,
  linkNeedingAccount,
  takePendingLink,
} from "./kept-link";

// The app's own storage, in memory.
const mockStored = new Map<string, string>();
jest.mock("@/lib/app-data", () => ({
  readAppData: jest.fn((key: string) => Promise.resolve(mockStored.get(key) ?? null)),
  writeAppData: jest.fn((key: string, value: string) => {
    mockStored.set(key, value);
    return Promise.resolve();
  }),
}));

const noon = new Date("2026-11-22T12:00:00Z");
const minutesLater = (minutes: number) => new Date(noon.getTime() + minutes * 60_000);
const id = "0190a1d6-0000-7000-8000-0000000000d1";
const rate = `/bookings/${id}/rate`;

beforeEach(() => {
  mockStored.clear();
});

describe("which links need an account (spec 20, 3.2)", () => {
  it("are the member screens and the account's own screens that emails open", () => {
    for (const path of [
      `/bookings/${id}`,
      rate,
      `/drive/trips/${id}`,
      `/drive/trips/${id}/edit/time`,
      `/people/${id}`,
      "/profile/edit",
      `/messages/${id}`,
      "/notices",
      "/settings/feedback",
      "/settings/beta-news",
      "/settings/reports",
      "/settings/privacy/download",
      "/settings/password",
      "/onboarding/faster",
    ]) {
      expect(linkNeedingAccount(path)).toBe(path);
    }
  });

  it("are never a public screen, sign-in, the sign-up steps or an address elsewhere", () => {
    for (const path of [
      "/",
      `/trips/${id}`,
      `/meeting-points/${id}`,
      "/sign-in",
      "/invite/BETA2345",
      "/onboarding/about-you",
      "/account/deletion",
      "/settings",
      "/verify-email",
      "https://example.com/notices",
      "//example.com/notices",
      `/bookings/${id}/rate/more`,
      `/bookings/../${id}`,
      "",
      null,
    ]) {
      expect(linkNeedingAccount(path)).toBeNull();
    }
  });
});

describe("a link kept while someone signs in", () => {
  it("is taken once", async () => {
    await keepPendingLink(rate, noon);
    expect(await takePendingLink(minutesLater(10))).toBe(rate);
    expect(await takePendingLink(minutesLater(11))).toBeNull();
  });

  it("is forgotten after an hour", async () => {
    await keepPendingLink(rate, noon);
    expect(await takePendingLink(minutesLater(61))).toBeNull();
  });

  it("is not there unless kept, nor when the stored value is damaged or not a member screen", async () => {
    expect(await takePendingLink(noon)).toBeNull();
    mockStored.set("pending-link", "{not json");
    expect(await takePendingLink(noon)).toBeNull();
    mockStored.set(
      "pending-link",
      JSON.stringify({ path: "https://example.com/", keptAt: noon.toISOString() }),
    );
    expect(await takePendingLink(noon)).toBeNull();
  });

  it("is kept only if none waits, when it is only an offer (spec 27, 3.7)", async () => {
    await keepPendingLink(rate, noon);
    await keepPendingLinkIfNone("/onboarding/faster", minutesLater(5));
    expect(await takePendingLink(minutesLater(6))).toBe(rate);

    // One kept over an hour ago, or none: this one is kept.
    await keepPendingLink(rate, noon);
    await keepPendingLinkIfNone("/onboarding/faster", minutesLater(61));
    expect(await takePendingLink(minutesLater(62))).toBe("/onboarding/faster");
    await keepPendingLinkIfNone("/onboarding/faster", noon);
    expect(await takePendingLink(minutesLater(1))).toBe("/onboarding/faster");
  });

  it("forgets a kept link only when it is the one named (spec 27, 3.4)", async () => {
    await keepPendingLink("/settings/password", noon);
    await forgetPendingLink("/settings/password");
    expect(await takePendingLink(minutesLater(1))).toBeNull();

    await keepPendingLink(rate, noon);
    await forgetPendingLink("/settings/password");
    expect(await takePendingLink(minutesLater(1))).toBe(rate);
  });

  it("leads on after signing in, after a booking or an offer chosen since", async () => {
    await keepPendingLink(rate, noon);
    expect(await takeKeptChoice(minutesLater(5))).toBe(rate);

    await keepPendingLink(rate, noon);
    await keepPendingOffer(minutesLater(1));
    expect(await takeKeptChoice(minutesLater(5))).toBe("/offer");
    // Taken with the offer: nothing is left for a later sign-in.
    expect(await takeKeptChoice(minutesLater(6))).toBeNull();

    await keepPendingLink(rate, noon);
    await keepPendingBooking({ tripId: id, board: 0, alight: 1, seats: 1 }, minutesLater(1));
    expect(await takeKeptChoice(minutesLater(5))).toMatchObject({ pathname: "/trips/[id]/book" });
    expect(await takeKeptChoice(minutesLater(6))).toBeNull();

    await keepPendingLink(rate, noon);
    await keepPendingProblem(id, minutesLater(1));
    expect(await takeKeptChoice(minutesLater(5))).toEqual({
      pathname: "/meeting-points/[id]/problem",
      params: { id },
    });
    expect(await takeKeptChoice(minutesLater(6))).toBeNull();
  });
});
