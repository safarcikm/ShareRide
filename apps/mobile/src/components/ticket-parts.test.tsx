import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { Bell, Share, Zap } from "lucide-react-native";
import type { ReactElement } from "react";
import { Text } from "react-native";
import { LanguageProvider } from "@/i18n/language";
import { filledButtons } from "@/testing/buttons";
import { cardFace } from "@/testing/lift";
import { colors, icelandScene, people } from "@/theme/tokens";
import { Button } from "./button";
import { IconButton } from "./icon-button";
import { NeedsYouCard } from "./needs-you-card";
import { RideTicket, TicketFoot, Timetable } from "./ride-ticket";
import { Road } from "./road";

// Spec 31, 3.3: the parts that carry "one ride, one ticket".

/** The colour scheme the parts see; light unless a test says otherwise. */
let mockScheme: "light" | "dark" = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockScheme,
}));
let mockLanguage = "en-GB";
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: mockLanguage }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

afterEach(() => {
  mockScheme = "light";
  mockLanguage = "en-GB";
});

const inApp = (ui: ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);
const hidden = (testID: string) => screen.getByTestId(testID, { includeHiddenElements: true });
const allHidden = (testID: string) =>
  screen.queryAllByTestId(testID, { includeHiddenElements: true });

const selfoss = { time: "10:00", place: "N1 Selfoss" };
const vik = { time: "11:35", place: "N1 Vík" };

describe("RideTicket", () => {
  it("shows the day, both times and places, what lies between and the price", async () => {
    await render(
      <RideTicket
        day="Sat 28 Nov"
        from={selfoss}
        to={vik}
        between="1 h 35 min"
        price={{ amount: "1,500 ISK", unit: "per seat" }}
      />,
    );
    expect(screen.getByText("Sat 28 Nov")).toHaveStyle({
      fontSize: 13,
      color: colors.light.textMuted,
    });
    for (const time of ["10:00", "11:35"]) {
      expect(screen.getByText(time)).toHaveStyle({
        fontFamily: "Fredoka_600SemiBold",
        color: colors.light.text,
      });
    }
    expect(screen.getByText("N1 Selfoss")).toHaveStyle({ fontFamily: "Nunito_700Bold" });
    expect(screen.getByText("N1 Vík")).toBeVisible();
    expect(screen.getByText("1 h 35 min")).toHaveStyle({ color: colors.light.textMuted });
    expect(screen.getByText("1,500 ISK")).toHaveStyle({
      fontFamily: "Fredoka_600SemiBold",
      fontSize: 22,
      textAlign: "right",
    });
    expect(screen.getByText("per seat")).toHaveStyle({ color: colors.light.textMuted });
  });

  it("is a surface with the card's corners and shadow, and no padding of its own", async () => {
    await render(<RideTicket day="Sat 28 Nov" from={selfoss} to={vik} between="1 h 35 min" />);
    expect(screen.getByTestId("card-face")).toHaveStyle({
      backgroundColor: colors.light.surface,
      borderRadius: 22,
      padding: 0,
    });
    expect(screen.getByTestId("card-face")).toHaveStyle(cardFace());
  });

  it("shows no price without one, and Free where that is the amount", async () => {
    await render(<RideTicket day="Sat 28 Nov" from={selfoss} to={vik} between="1 h 35 min" />);
    expect(screen.queryByTestId("ticket-price")).toBeNull();
    await screen.rerender(
      <RideTicket
        day="Sat 28 Nov"
        from={selfoss}
        to={vik}
        between="1 h 35 min"
        price={{ amount: "Free", unit: "per seat" }}
      />,
    );
    expect(within(screen.getByTestId("ticket-price")).getByText("Free")).toBeVisible();
  });

  it("shows a price without a unit, and a line more under it, such as what two seats cost", async () => {
    await render(
      <RideTicket
        day="Sat 28 Nov"
        from={selfoss}
        to={vik}
        between="1 h 35 min"
        price={{ amount: "Free" }}
      />,
    );
    expect(within(screen.getByTestId("ticket-price")).getByText("Free")).toBeVisible();
    expect(screen.queryByText("per seat")).toBeNull();
    await screen.rerender(
      <RideTicket
        day="Sat 28 Nov"
        from={selfoss}
        to={vik}
        between="1 h 35 min"
        price={{ amount: "1,500 ISK", unit: "per seat", more: "3,000 ISK for 2 seats" }}
      />,
    );
    const price = within(screen.getByTestId("ticket-price"));
    expect(price.getByText("per seat")).toBeVisible();
    expect(price.getByText("3,000 ISK for 2 seats")).toHaveStyle({
      color: colors.light.textMuted,
      textAlign: "right",
    });
  });

  it("says one thing more about the ride under the timetable, over the tear line", async () => {
    await render(
      <RideTicket
        day="Sat 28 Nov"
        from={selfoss}
        to={vik}
        between="1 h 35 min"
        note="Anna drives Reykjavík → Höfn"
        foot={<TicketFoot start={<Text>Anna</Text>} />}
      />,
    );
    const note = within(screen.getByTestId("ticket-top")).getByText("Anna drives Reykjavík → Höfn");
    expect(note).toHaveStyle({ fontSize: 15, color: colors.light.textMuted });
    expect(screen.getByTestId("ticket-note")).toBeVisible();
    await screen.rerender(
      <RideTicket day="Sat 28 Nov" from={selfoss} to={vik} between="1 h 35 min" />,
    );
    expect(screen.queryByTestId("ticket-note")).toBeNull();
  });

  it("holds all it shows under a name of its own, for a list to find its rides", async () => {
    const onPress = jest.fn();
    await render(
      <RideTicket
        fill
        testID="trip-result"
        day="Sat 28 Nov"
        from={selfoss}
        to={vik}
        between="1 h 35 min"
        onPress={onPress}
        accessibilityLabel="Selfoss to Vík"
        foot={<TicketFoot start={<Text>Jón</Text>} />}
      />,
    );
    const ride = screen.getByTestId("trip-result");
    expect(within(ride).getByText("Sat 28 Nov")).toBeVisible();
    expect(within(ride).getByText("N1 Vík")).toBeVisible();
    expect(within(ride).getByText("Jón")).toBeVisible();
    // It takes the room the card has, so the foot stays at the bottom of a filled one.
    expect(ride).toHaveStyle({ flexGrow: 1 });
    await fireEvent.press(ride);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("draws the line from a ring to a dot, hidden from screen readers", async () => {
    await render(<RideTicket day="Sat 28 Nov" from={selfoss} to={vik} between="1 h 35 min" />);
    expect(hidden("ticket-ring")).toHaveStyle({
      width: 12,
      height: 12,
      borderWidth: 3,
      borderColor: colors.light.primary,
      backgroundColor: colors.light.surface,
    });
    expect(hidden("ticket-dot")).toHaveStyle({
      width: 12,
      height: 12,
      backgroundColor: colors.light.primary,
    });
    for (const rail of allHidden("ticket-rail")) {
      expect(rail).toHaveStyle({ width: 3, backgroundColor: colors.light.primary });
    }
    expect(screen.queryByTestId("ticket-ring")).toBeNull();
    expect(screen.queryByTestId("ticket-dot")).toBeNull();
    expect(screen.queryAllByTestId("ticket-rail")).toHaveLength(0);
  });

  it("keeps a time on the first line of a place that wraps (spec 31, 3.3)", async () => {
    await render(
      <RideTicket
        day="Sat 28 Nov"
        from={{ time: "10:00", place: "Kirkjubæjarklaustur, N1" }}
        to={vik}
        between="1 h 35 min"
        price={{ amount: "1,500 ISK", unit: "per seat" }}
      />,
    );
    for (const end of ["ticket-from", "ticket-to"]) {
      expect(screen.getByTestId(end)).toHaveStyle({
        flexDirection: "row",
        alignItems: "flex-start",
      });
    }
    // The place takes the room that is left and wraps inside it; the time
    // and the price keep their width.
    expect(screen.getByTestId("ticket-from-place")).toHaveStyle({ flex: 1 });
    for (const time of screen.getAllByTestId("ticket-time")) {
      expect(time).toHaveStyle({ flexShrink: 0 });
    }
    expect(screen.getByTestId("ticket-route")).toHaveStyle({ flexGrow: 1, flexShrink: 1 });
    expect(screen.getByTestId("ticket-price")).toHaveStyle({ flexShrink: 0 });
  });

  it("puts a price that does not fit beside the timetable under it, at the right", async () => {
    await render(
      <RideTicket
        day="Sat 28 Nov"
        from={{ time: "10:00", place: "Kirkjubæjarklaustur, N1" }}
        to={vik}
        between="1 h 35 min"
        price={{ amount: "1,500 ISK", unit: "per seat" }}
      />,
    );
    expect(screen.getByTestId("ticket-times")).toHaveStyle({
      flexDirection: "row",
      flexWrap: "wrap",
    });
    expect(screen.getByTestId("ticket-price")).toHaveStyle({ marginLeft: "auto" });
  });

  it("keeps the times of every ticket in a column of one width", async () => {
    await render(<RideTicket day="Sat 28 Nov" from={selfoss} to={vik} between="1 h 35 min" />);
    // Fredoka's digits differ in width, so each cell holds the widest time
    // there can be, which nobody sees or hears.
    const widths = allHidden("ticket-time-width");
    expect(widths).toHaveLength(3);
    for (const width of widths) {
      expect(width).toHaveTextContent("22:22");
      expect(width).toHaveStyle({ height: 0, opacity: 0, fontFamily: "Fredoka_600SemiBold" });
    }
    expect(screen.queryAllByTestId("ticket-time-width")).toHaveLength(0);
    // No time is written twice: a search of the page finds each once.
    for (const time of ["10:00", "11:35"]) {
      expect(screen.getAllByText(time, { includeHiddenElements: true })).toHaveLength(1);
    }
  });

  it("is a timetable on its own, for a card about a part of a ride", async () => {
    await render(
      <Timetable
        from={selfoss}
        to={vik}
        between="1 seat, 800 ISK"
        price={{ amount: "800 ISK", unit: "per seat" }}
      />,
    );
    expect(screen.getByText("10:00")).toBeVisible();
    expect(screen.getByText("N1 Vík")).toBeVisible();
    expect(screen.getByText("1 seat, 800 ISK")).toBeVisible();
    expect(screen.getByText("800 ISK")).toBeVisible();
    expect(screen.queryByTestId("card")).toBeNull();
    expect(screen.queryByTestId("ticket-day")).toBeNull();
  });

  it("shows something under a place, such as how far it is", async () => {
    await render(
      <RideTicket
        day="Sat 28 Nov"
        from={{ ...selfoss, under: <Text>1.3 km from Kringlan</Text> }}
        to={vik}
        between="1 h 35 min"
      />,
    );
    expect(
      within(screen.getByTestId("ticket-from-place")).getByText("1.3 km from Kringlan"),
    ).toBeVisible();
  });

  it("holds something to press at the right of a place, such as Change, on the place's row", async () => {
    const change = jest.fn();
    await render(
      <RideTicket
        day="Your part of the ride"
        from={{ ...selfoss, action: <Button variant="text" label="Change" onPress={change} /> }}
        to={vik}
        between="1 h 35 min"
      />,
    );
    const from = screen.getByTestId("ticket-from");
    // After the place, in the same row; the other end has none.
    const parts = within(from)
      .getAllByTestId(/^ticket-(from-place|end-action)$/)
      .map((part) => String(part.props.testID));
    expect(parts).toEqual(["ticket-from-place", "ticket-end-action"]);
    expect(within(screen.getByTestId("ticket-to")).queryByTestId("ticket-end-action")).toBeNull();
    // With no room beside the place's longest word it goes under the place,
    // at the right, and never squeezes the name.
    expect(within(from).getByTestId("ticket-end-with-action")).toHaveStyle({
      flexDirection: "row",
      flexWrap: "wrap",
    });
    expect(within(from).getByTestId("ticket-end-action")).toHaveStyle({
      flexShrink: 0,
      marginLeft: "auto",
    });
    await fireEvent.press(within(from).getByRole("button", { name: "Change" }));
    expect(change).toHaveBeenCalledTimes(1);
  });

  it("has a caption that heads a part of its screen as a heading, and a day as plain text", async () => {
    const { rerender } = await render(
      <RideTicket
        headed
        day="Your part of the ride"
        from={selfoss}
        to={vik}
        between="1 h 35 min"
      />,
    );
    expect(screen.getByRole("header", { name: "Your part of the ride" })).toBeVisible();
    await rerender(<RideTicket day="Fri 27 Nov" from={selfoss} to={vik} between="1 h 35 min" />);
    expect(screen.getByText("Fri 27 Nov")).toBeVisible();
    expect(screen.queryByRole("header")).toBeNull();
  });

  it("unfolds something under the timetable, over the tear line, such as the stops to choose from", async () => {
    await render(
      <RideTicket
        day="Your part of the ride"
        from={selfoss}
        to={vik}
        between="1 h 35 min"
        note="Jón drives BSÍ → Vík"
        unfolded={<Text>Where you get in</Text>}
        foot={<Text>2 free on your part</Text>}
      />,
    );
    const top = within(screen.getByTestId("ticket-top"));
    expect(top.getByText("Where you get in")).toBeVisible();
    const order = screen
      .getAllByTestId(/^ticket-(times|note|unfolded|tear)$/, { includeHiddenElements: true })
      .map((part) => String(part.props.testID));
    expect(order).toEqual(["ticket-times", "ticket-note", "ticket-unfolded", "ticket-tear"]);
  });

  it("shows its tags at the right of the day", async () => {
    await render(
      <RideTicket
        day="Sat 28 Nov"
        tags={[
          { label: "Book instantly", kind: "positive", icon: Zap },
          { label: "Women only", kind: "womenOnly" },
        ]}
        from={selfoss}
        to={vik}
        between="1 h 35 min"
      />,
    );
    const row = screen.getByTestId("ticket-day");
    // Tags that do not fit beside the day go under it.
    expect(row).toHaveStyle({ flexDirection: "row", flexWrap: "wrap", alignItems: "center" });
    expect(within(row).getByText("Sat 28 Nov")).toHaveStyle({ flexGrow: 1, flexShrink: 1 });
    expect(within(row).getAllByTestId("tag")).toHaveLength(2);
    expect(within(row).getByText("Book instantly")).toHaveStyle({ color: colors.light.primary });
  });

  it("says what this place needs under a tear line, hidden from screen readers", async () => {
    await render(
      <RideTicket
        day="Sat 28 Nov"
        from={selfoss}
        to={vik}
        between="1 h 35 min"
        foot={<TicketFoot start={<Text>Jón</Text>} end={<Text>2 seats left</Text>} />}
      />,
    );
    expect(hidden("ticket-tear")).toBeOnTheScreen();
    expect(screen.queryByTestId("ticket-tear")).toBeNull();
    // A notch in each edge, in the page's colour, half of it outside the card.
    const notches = allHidden("ticket-notch");
    expect(notches).toHaveLength(2);
    for (const notch of notches) {
      expect(notch).toHaveStyle({
        position: "absolute",
        width: 16,
        height: 16,
        borderRadius: 999,
        backgroundColor: colors.light.background,
      });
    }
    expect(notches[0]).toHaveStyle({ left: -8 });
    expect(notches[1]).toHaveStyle({ right: -8 });
    expect(screen.getByTestId("card-face")).toHaveStyle({ overflow: "hidden" });
    const foot = screen.getByTestId("ticket-foot");
    // Its end goes under its start when they do not fit beside each other;
    // with words only it is as tall as with a small picture.
    expect(foot).toHaveStyle({
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      minHeight: 28 + 2 * 10,
    });
    expect(within(foot).getByText("Jón")).toBeVisible();
    expect(screen.getByTestId("ticket-foot-start")).toHaveStyle({ flexGrow: 1, flexShrink: 1 });
    const end = screen.getByTestId("ticket-foot-end");
    expect(end).toHaveStyle({ marginLeft: "auto" });
    expect(within(end).getByText("2 seats left")).toBeVisible();
  });

  it("has no tear line without a foot", async () => {
    await render(<RideTicket day="Sat 28 Nov" from={selfoss} to={vik} between="1 h 35 min" />);
    expect(allHidden("ticket-tear")).toHaveLength(0);
    expect(allHidden("ticket-notch")).toHaveLength(0);
    expect(screen.queryByTestId("ticket-foot")).toBeNull();
  });

  it.each(["light", "dark"] as const)(
    "has a moss outline when it is mine, in %s",
    async (scheme) => {
      mockScheme = scheme;
      await render(
        <RideTicket mine day="Sat 28 Nov" from={selfoss} to={vik} between="1 h 35 min" />,
      );
      expect(screen.getByTestId("card-face")).toHaveStyle(cardFace(colors[scheme].primary, scheme));
    },
  );

  it("is one link, named in one line", async () => {
    await render(
      <RideTicket
        day="Sat 28 Nov"
        from={selfoss}
        to={vik}
        between="1 h 35 min"
        href="/about"
        accessibilityLabel="Sat 28 Nov, 10:00 N1 Selfoss to 11:35 N1 Vík, 1,500 ISK per seat"
      />,
    );
    expect(
      screen.getByRole("link", {
        name: "Sat 28 Nov, 10:00 N1 Selfoss to 11:35 N1 Vík, 1,500 ISK per seat",
      }),
    ).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is a button when it is pressed, and nothing to press without either", async () => {
    const onPress = jest.fn();
    await render(
      <RideTicket
        day="Sat 28 Nov"
        from={selfoss}
        to={vik}
        between="1 h 35 min"
        onPress={onPress}
        accessibilityLabel="Selfoss to Vík"
      />,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Selfoss to Vík" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    await screen.rerender(
      <RideTicket day="Sat 28 Nov" from={selfoss} to={vik} between="1 h 35 min" />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("says at which end each time stands, where the ticket is not one thing to press", async () => {
    await render(
      <RideTicket
        day="Sat 28 Nov"
        from={selfoss}
        to={vik}
        between="1 h 35 min"
        ends={{ from: "Get in", to: "Get out" }}
      />,
    );
    // A phone's screen reader reads each text by itself: the time says its end.
    expect(screen.getByLabelText("Get in: 10:00")).toBe(screen.getByText("10:00"));
    expect(screen.getByLabelText("Get out: 11:35")).toBe(screen.getByText("11:35"));
    // Without the words a time is read as written.
    await screen.rerender(
      <RideTicket day="Sat 28 Nov" from={selfoss} to={vik} between="1 h 35 min" />,
    );
    expect(screen.queryByLabelText(/10:00/)).toBeNull();
    expect(screen.getByText("10:00")).toBeVisible();
  });

  it("keeps a moss edge under the pointer, darker when it is mine", async () => {
    const ticket = (mine: boolean) => (
      <RideTicket
        mine={mine}
        day="Sat 28 Nov"
        from={selfoss}
        to={vik}
        between="1 h 35 min"
        onPress={jest.fn()}
        accessibilityLabel="Selfoss to Vík"
      />
    );
    await render(ticket(false));
    await fireEvent(screen.getByRole("button"), "hoverIn");
    expect(screen.getByTestId("card-face")).toHaveStyle(cardFace(colors.light.primary));
    await screen.rerender(ticket(true));
    expect(screen.getByTestId("card-face")).toHaveStyle(cardFace(colors.light.primaryEdge));
  });

  it("holds a button of its own in its corner, which does not press it", async () => {
    const onPress = jest.fn();
    const onShare = jest.fn();
    await render(
      <RideTicket
        day="Sat 28 Nov"
        tags={[{ label: "Book instantly", kind: "positive" }]}
        from={selfoss}
        to={vik}
        between="1 h 35 min"
        onPress={onPress}
        accessibilityLabel="Selfoss to Vík"
        corner={<IconButton quiet icon={Share} label="Share this ride" onPress={onShare} />}
      />,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Share this ride" }));
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    const ticket = screen.getByRole("button", { name: "Selfoss to Vík" });
    expect(within(ticket).queryByRole("button", { name: "Share this ride" })).toBeNull();
    // The day's row leaves the corner its room, after the tags.
    expect(screen.getByTestId("ticket-day")).toHaveStyle({ paddingRight: 16 + 32 });
  });

  it("fills its cell of a grid, with the foot at the bottom", async () => {
    await render(
      <RideTicket
        fill
        day="Sat 28 Nov"
        from={selfoss}
        to={vik}
        between="1 h 35 min"
        foot={<TicketFoot start={<Text>Jón</Text>} />}
      />,
    );
    expect(screen.getByTestId("card")).toHaveStyle({ flexGrow: 1 });
    expect(screen.getByTestId("card-face")).toHaveStyle({ flexGrow: 1 });
    expect(screen.getByTestId("ticket-top")).toHaveStyle({ flexGrow: 1 });
  });

  it("tells when the pointer or the keyboard comes to it, and keeps a marked edge", async () => {
    const onShow = jest.fn();
    await render(
      <RideTicket
        marked
        day="Sat 28 Nov"
        from={selfoss}
        to={vik}
        between="1 h 35 min"
        onPress={jest.fn()}
        accessibilityLabel="Selfoss to Vík"
        onShow={onShow}
      />,
    );
    expect(screen.getByTestId("card-face")).toHaveStyle(cardFace(colors.light.primary));
    await fireEvent(screen.getByRole("button"), "hoverIn");
    await fireEvent(screen.getByRole("button"), "focus");
    expect(onShow).toHaveBeenCalledTimes(2);
  });
});

describe("Road", () => {
  const booking = ["Asked", "Confirmed", "Trip day", "Done"];

  it.each([
    [0, "Step 1 of 4: Asked"],
    [1, "Step 2 of 4: Confirmed"],
    [3, "Step 4 of 4: Done"],
  ])("is one line for screen readers at step %i", async (current, label) => {
    await inApp(<Road steps={booking} current={current} />);
    expect(screen.getByRole("image", { name: label })).toBeVisible();
    // The names under the road are for the eye: the line above says the one that counts.
    for (const name of booking) {
      expect(screen.queryByText(name)).toBeNull();
      expect(screen.getByText(name, { includeHiddenElements: true })).toBeOnTheScreen();
    }
  });

  it.each([
    [7, "Step 4 of 4: Done", "100%"],
    [-1, "Step 1 of 4: Asked", "0%"],
  ])("keeps the car on the road at step %i", async (current, label, left) => {
    await inApp(<Road steps={booking} current={current} />);
    expect(screen.getByRole("image", { name: label })).toBeVisible();
    expect(hidden("road-car")).toHaveStyle({ left });
    expect(allHidden("road-mark")).toHaveLength(3);
  });

  it("takes two steps of one name", async () => {
    await inApp(<Road steps={["Asked", "Seats", "Seats", "Done"]} current={2} />);
    expect(screen.getByRole("image", { name: "Step 3 of 4: Seats" })).toBeVisible();
    expect(screen.getAllByText("Seats", { includeHiddenElements: true })).toHaveLength(2);
  });

  it("says it in Icelandic", async () => {
    mockLanguage = "is-IS";
    await inApp(<Road steps={["Leið", "Tími", "Sæti", "Verð", "Yfirfara"]} current={2} />);
    expect(screen.getByRole("image", { name: "Skref 3 af 5: Sæti" })).toBeVisible();
  });

  it.each(["light", "dark"] as const)(
    "is a grey road, moss behind the car, in %s",
    async (scheme) => {
      mockScheme = scheme;
      await inApp(<Road steps={booking} current={1} />);
      expect(hidden("road-lane")).toHaveStyle({
        height: 12,
        backgroundColor: icelandScene[scheme].road,
      });
      expect(hidden("road-gone")).toHaveStyle({
        height: 12,
        width: `${String((1 / 3) * 100)}%`,
        backgroundColor: colors[scheme].primary,
      });
      // The road runs on past the first and the last step, half a car each way.
      expect(hidden("road-lead")).toHaveStyle({
        width: 30,
        backgroundColor: colors[scheme].primary,
      });
    },
  );

  describe("with no room for its names, as with large text on a narrow phone", () => {
    /** Tells a part how it was laid out, as the phone or the browser does. */
    const laidOut = (testID: string, width: number, height: number, nth = 0) => {
      const part = allHidden(testID)[nth];
      if (part === undefined) throw new Error(`No ${testID} ${String(nth)}`);
      return fireEvent(part, "layout", { nativeEvent: { layout: { x: 0, y: 0, width, height } } });
    };
    /** The road 328 wide with names of one line 18 high, then each name's width and height. */
    const names = async (...sizes: readonly (readonly [width: number, height: number])[]) => {
      await laidOut("road-names", 328, 18);
      await laidOut("road-one-line", 40, 18);
      for (const [index, [width, height]] of sizes.entries()) {
        await laidOut("road-name", width, height, index);
      }
    };

    it("keeps the names under their marks while each has one line and they fit beside each other", async () => {
      await inApp(<Road steps={booking} current={1} />);
      // With a gap of 8 between them, they fill the road.
      await names([62, 18], [101, 18], [101, 18], [40, 18]);
      expect(allHidden("road-now")).toHaveLength(0);
      expect(hidden("road-names")).not.toHaveStyle({ opacity: 0 });
      expect(hidden("road-names")).toHaveStyle({ columnGap: 8 });
    });

    it("says the step in a line under the road when a name takes two lines, as a phone breaks a word too long", async () => {
      await inApp(<Road steps={booking} current={1} />);
      await names([50, 18], [101, 36], [101, 36], [52, 18]);
      // What a screen reader hears, for the eye: still one line to hear.
      expect(hidden("road-now")).toHaveTextContent("Step 2 of 4: Confirmed");
      expect(screen.getByRole("image", { name: "Step 2 of 4: Confirmed" })).toBeVisible();
      expect(screen.queryByText("Step 2 of 4: Confirmed")).toBeNull();
      // The names stay to be measured, out of sight and out of the way.
      expect(hidden("road-names")).toHaveStyle({ opacity: 0, position: "absolute" });
    });

    it("says the step in a line when the names are wider than the road together, as a browser keeps each word whole", async () => {
      await inApp(<Road steps={booking} current={2} />);
      await names([76, 18], [125, 18], [104, 18], [70, 18]);
      expect(hidden("road-now")).toHaveTextContent("Step 3 of 4: Trip day");
    });

    it("shows the names again once they have room", async () => {
      await inApp(<Road steps={booking} current={1} />);
      await names([50, 18], [101, 36], [101, 36], [52, 18]);
      expect(allHidden("road-now")).toHaveLength(1);
      await names([62, 18], [101, 18], [101, 18], [40, 18]);
      expect(allHidden("road-now")).toHaveLength(0);
      expect(hidden("road-names")).not.toHaveStyle({ opacity: 0 });
    });

    it("decides nothing before everything is measured", async () => {
      await inApp(<Road steps={booking} current={1} />);
      await laidOut("road-name", 101, 36, 1);
      expect(allHidden("road-now")).toHaveLength(0);
    });

    it("decides nothing from sizes of nothing, as the web gives for a screen under another", async () => {
      await inApp(<Road steps={booking} current={1} />);
      await names([62, 18], [101, 18], [101, 18], [40, 18]);
      // The screen goes out of sight: each part measures nothing, one by one.
      await laidOut("road-names", 0, 0);
      expect(allHidden("road-now")).toHaveLength(0);
      await laidOut("road-one-line", 0, 0);
      for (const index of [0, 1, 2, 3]) await laidOut("road-name", 0, 0, index);
      expect(allHidden("road-now")).toHaveLength(0);
      // And comes back, the road first.
      await laidOut("road-names", 328, 18);
      await laidOut("road-one-line", 40, 18);
      expect(allHidden("road-now")).toHaveLength(0);
    });

    it("keeps the names when each is counted up to half a point wider than it is, as some browsers round each width alone", async () => {
      await inApp(<Road steps={booking} current={1} />);
      // 61.5, 90.5, 90.5 and 61.5 fill the road with their gaps of 8.
      await names([62, 18], [91, 18], [91, 18], [62, 18]);
      expect(allHidden("road-now")).toHaveLength(0);
    });
  });

  it("has nothing behind the car on the first step", async () => {
    await inApp(<Road steps={booking} current={0} />);
    expect(allHidden("road-gone")).toHaveLength(0);
    expect(allHidden("road-lead")).toHaveLength(0);
  });

  it("stands one car, 60 wide, on the step it is at, and marks the others", async () => {
    await inApp(<Road steps={booking} current={2} />);
    expect(allHidden("puffins-in-car")).toHaveLength(1);
    expect(hidden("road-car")).toHaveStyle({
      left: `${String((2 / 3) * 100)}%`,
      marginLeft: -30,
    });
    const marks = allHidden("road-mark");
    expect(marks).toHaveLength(3);
    // Passed steps are white on the moss; those to come have a grey ring.
    expect(marks[0]).toHaveStyle({
      left: "0%",
      width: 10,
      height: 10,
      backgroundColor: colors.light.surface,
      borderColor: colors.light.surface,
    });
    expect(marks[1]).toHaveStyle({ borderColor: colors.light.surface });
    expect(marks[2]).toHaveStyle({
      left: "100%",
      backgroundColor: colors.light.surface,
      borderColor: colors.light.control,
    });
  });

  it("names the steps under it, the one it is at in the text colour", async () => {
    await inApp(<Road steps={booking} current={1} />);
    const name = (text: string) => screen.getByText(text, { includeHiddenElements: true });
    expect(name("Asked")).toHaveStyle({
      fontSize: 13,
      color: colors.light.textMuted,
      textAlign: "left",
    });
    expect(name("Confirmed")).toHaveStyle({ color: colors.light.text, textAlign: "center" });
    expect(name("Trip day")).toHaveStyle({ color: colors.light.textMuted, textAlign: "center" });
    expect(name("Done")).toHaveStyle({ color: colors.light.textMuted, textAlign: "right" });
  });
});

describe("NeedsYouCard", () => {
  it.each(["light", "dark"] as const)(
    "is a soft yellow card with the car's yellow edge, in %s",
    async (scheme) => {
      mockScheme = scheme;
      await render(
        <NeedsYouCard
          icon={Bell}
          title="Dóra asks for 1 seat"
          detail="Mjódd to Selfoss, Fri 27 Nov. 11 h left to answer."
          action={{ label: "See the request", onPress: jest.fn() }}
        />,
      );
      expect(screen.getByTestId("needs-you-card")).toHaveStyle({ borderRadius: 22 });
      expect(screen.getByTestId("needs-you-face")).toHaveStyle({
        backgroundColor: colors[scheme].warningSoft,
        borderRadius: 22,
        ...cardFace(people.sun, scheme),
      });
      expect(hidden("needs-you-icon")).toHaveStyle({
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: people.sun,
      });
      // The bold line says what is asked; the yellow only repeats it (R31.4).
      expect(screen.getByText("Dóra asks for 1 seat")).toHaveStyle({
        fontFamily: "Nunito_700Bold",
        color: colors[scheme].text,
      });
      expect(screen.getByText("Mjódd to Selfoss, Fri 27 Nov. 11 h left to answer.")).toHaveStyle({
        color: colors[scheme].warning,
      });
    },
  );

  it("has one button, filled", async () => {
    const onPress = jest.fn();
    await render(
      <NeedsYouCard
        icon={Bell}
        title="Dóra asks for 1 seat"
        action={{ label: "See the request", onPress }}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    await fireEvent.press(screen.getByRole("button", { name: "See the request" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("button-face")).toHaveStyle({
      backgroundColor: colors.light.primary,
    });
  });

  it("links to a screen when its button has an address", async () => {
    await render(
      <NeedsYouCard
        icon={Bell}
        title="Your seat to Vík is waiting"
        action={{ label: "Pay now", href: "/about" }}
      />,
    );
    expect(screen.getByRole("link", { name: "Pay now" })).toBeVisible();
  });

  it("outlines its button where the screen has a main button of its own (R31.1)", async () => {
    await render(
      <NeedsYouCard
        icon={Bell}
        title="Add a picture of yourself"
        action={{ label: "Add a picture", outlined: true, onPress: jest.fn() }}
      />,
    );
    expect(screen.getByTestId("button-face")).toHaveStyle({
      backgroundColor: colors.light.surface,
      borderColor: colors.light.control,
    });
  });

  it("shows only its line without a detail or a button", async () => {
    await render(<NeedsYouCard icon={Bell} title="Leaves in 10 minutes" />);
    expect(screen.getByText("Leaves in 10 minutes")).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("holds a whole request in place of its lines", async () => {
    await render(
      <NeedsYouCard>
        <Text>Dóra</Text>
        <Button label="Accept" onPress={jest.fn()} />
      </NeedsYouCard>,
    );
    const card = screen.getByTestId("needs-you-card");
    expect(within(card).getByText("Dóra")).toBeVisible();
    expect(within(card).getByRole("button", { name: "Accept" })).toBeVisible();
    expect(screen.queryByTestId("needs-you-icon", { includeHiddenElements: true })).toBeNull();
  });
});

describe("filledButtons (R31.1)", () => {
  it("counts the filled buttons outside what needs you", async () => {
    await render(
      <>
        <NeedsYouCard
          icon={Bell}
          title="Dóra asks for 1 seat"
          action={{ label: "See the request", onPress: jest.fn() }}
        />
        <Button variant="secondary" label="Filters" onPress={jest.fn()} />
        <Button variant="text" label="Clear" onPress={jest.fn()} />
        <Button main label="Find a ride" onPress={jest.fn()} />
      </>,
    );
    expect(filledButtons()).toBe(1);
  });

  it("counts two when a screen has two", async () => {
    await render(
      <>
        <Button label="Accept" onPress={jest.fn()} />
        <Button label="Publish ride" href="/about" />
      </>,
    );
    expect(filledButtons()).toBe(2);
  });

  it("counts none on a screen without one", async () => {
    await render(<Button variant="secondary" label="Filters" onPress={jest.fn()} />);
    expect(filledButtons()).toBe(0);
  });
});
