import { renderRouter, screen } from "expo-router/testing-library";
import { Text } from "react-native";
import { useFestiveDays } from "@/beta/config";
import { onWebsite } from "@/lib/on-website";
import { useBanner } from "./use-banner";

jest.mock("@/lib/on-website", () => ({ onWebsite: jest.fn(() => false) }));
jest.mock("@/beta/config", () => ({ useFestiveDays: jest.fn(() => true) }));

const mockedOnWebsite = onWebsite as jest.Mock<boolean, []>;
const mockedFestiveDays = useFestiveDays as jest.Mock<boolean, []>;

/** A screen that says the banner of `at`, at `url`; one a test. */
async function bannerAt(at: string, url = "/") {
  // Made here, so it reads the clock as this test sets it up: the router
  // puts in its own timers, and with them its own Date.
  const moment = new Date(at);
  function Shown() {
    const { season, day } = useBanner(moment);
    return <Text testID="banner">{`${season} ${String(day)}`}</Text>;
  }
  await renderRouter({ index: Shown }, { initialUrl: url });
  return screen.getByTestId("banner").props.children as string;
}

describe("useBanner (spec 36, 3.1 and 3.9)", () => {
  afterEach(() => {
    mockedOnWebsite.mockReturnValue(false);
    mockedFestiveDays.mockReturnValue(true);
  });

  it.each([
    ["2027-01-15T23:59:00Z", "winter"],
    ["2027-05-31T23:59:00Z", "spring"],
    ["2027-06-01T00:00:00Z", "summer"],
  ])("at %s is %s: the date on a clock in Iceland", async (at, season) => {
    expect(await bannerAt(at)).toBe(`${season} null`);
  });

  it("is Iceland's date, not the device's: on a device 14 hours ahead it is already June", async () => {
    // The device's own calendar, as on a phone set to Kiribati (UTC+14).
    const ahead = (moment: Date) => new Date(moment.getTime() + 14 * 3_600_000);
    const spies = [
      jest.spyOn(Date.prototype, "getFullYear").mockImplementation(function (this: Date) {
        return ahead(this).getUTCFullYear();
      }),
      jest.spyOn(Date.prototype, "getMonth").mockImplementation(function (this: Date) {
        return ahead(this).getUTCMonth();
      }),
      jest.spyOn(Date.prototype, "getDate").mockImplementation(function (this: Date) {
        return ahead(this).getUTCDate();
      }),
    ];
    try {
      expect(await bannerAt("2027-05-31T23:30:00Z")).toBe("spring null");
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it("shows the day, with the festive days on (spec 36, 3.8)", async () => {
    expect(await bannerAt("2027-12-24T12:00:00Z")).toBe("winter christmas");
  });

  it("shows only the season with the festive days off", async () => {
    mockedFestiveDays.mockReturnValue(false);
    expect(await bannerAt("2027-12-24T12:00:00Z")).toBe("winter null");
  });

  it("on the website shows the date `?day=` names", async () => {
    mockedOnWebsite.mockReturnValue(true);
    expect(await bannerAt("2027-01-15T12:00:00Z", "/?day=2027-07-01")).toBe("summer null");
  });

  it.each(["2027-02-30", "banana"])(
    "on the website keeps today when `?day=` is %j, no date",
    async (day) => {
      mockedOnWebsite.mockReturnValue(true);
      expect(await bannerAt("2027-01-15T12:00:00Z", `/?day=${day}`)).toBe("winter null");
    },
  );

  it("on a phone ignores `?day=`", async () => {
    expect(await bannerAt("2027-01-15T12:00:00Z", "/?day=2027-07-01")).toBe("winter null");
  });
});
