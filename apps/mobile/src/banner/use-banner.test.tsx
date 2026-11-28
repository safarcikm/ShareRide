import { renderRouter, screen } from "expo-router/testing-library";
import { Text } from "react-native";
import { onWebsite } from "@/lib/on-website";
import { useBanner } from "./use-banner";

jest.mock("@/lib/on-website", () => ({ onWebsite: jest.fn(() => false) }));

const mockedOnWebsite = onWebsite as jest.Mock<boolean, []>;

/** A screen that says the banner of `at`, at `url`; one a test. */
async function bannerAt(at: string, url = "/") {
  function Shown() {
    const { season, day } = useBanner(new Date(at));
    return <Text testID="banner">{`${season} ${String(day)}`}</Text>;
  }
  await renderRouter({ index: Shown }, { initialUrl: url });
  return screen.getByTestId("banner").props.children as string;
}

describe("useBanner (spec 36, 3.1 and 3.9)", () => {
  afterEach(() => {
    mockedOnWebsite.mockReturnValue(false);
  });

  it.each([
    ["2027-01-15T23:59:00Z", "winter"],
    ["2027-05-31T23:59:00Z", "spring"],
    ["2027-06-01T00:00:00Z", "summer"],
  ])("at %s is %s: the date on a clock in Iceland", async (at, season) => {
    expect(await bannerAt(at)).toBe(`${season} null`);
  });

  it("shows no festive day while the switch is still to come", async () => {
    expect(await bannerAt("2027-06-17T12:00:00Z")).toBe("summer null");
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
