import { cancelReasons, lateMinutes, quickMessageKeys, type QuickMessage } from "@shareride/domain";
import { describe, expect, it } from "vitest";
import { cancelReasonText, quickMessageText, systemLineText } from "./chat.ts";
import { createTranslator } from "./translator.ts";

const en = createTranslator("en");
const is = createTranslator("is");

describe("quick messages in the reader's language (R7.2)", () => {
  it("reads the late one with its minutes in both languages", () => {
    expect(quickMessageText(en, { key: "late", minutes: 10 })).toBe("I'm running 10 minutes late");
    expect(quickMessageText(is, { key: "late", minutes: 10 })).toBe("Mér seinkar um 10 mínútur");
  });

  it("has a text in both languages for every quick message", () => {
    const all: QuickMessage[] = [
      ...lateMinutes.map((minutes) => ({ key: "late" as const, minutes })),
      ...quickMessageKeys.filter((key) => key !== "late").map((key) => ({ key })),
    ];
    for (const quick of all) {
      for (const t of [en, is]) {
        const text = quickMessageText(t, quick);
        expect(text).not.toContain("{");
        expect(text.length).toBeGreaterThan(0);
      }
    }
    expect(quickMessageText(en, { key: "thanks" })).toBe("Thank you!");
    expect(quickMessageText(is, { key: "whereAreYou" })).toBe("Hvar ertu?");
  });
});

describe("system lines in the reader's language (spec 7, 3.1, item 3)", () => {
  it("reads the opening line in both languages", () => {
    expect(systemLineText(en, { key: "opened" }, "Anna")).toBe(
      "Booking confirmed. You can message each other here.",
    );
    expect(systemLineText(is, { key: "opened" }, "Anna")).toBe(
      "Bókunin er staðfest. Þið getið skrifast á hér.",
    );
  });

  it("says who cancelled and why: you, or the other person by name", () => {
    const mine = {
      key: "cancelled",
      by: "me",
      reason: "plans_changed",
      note: "",
      wholeTrip: false,
    } as const;
    const theirs = { ...mine, by: "them", reason: "car_problem" } as const;
    expect(systemLineText(en, mine, "Anna")).toBe("You cancelled the booking: Plans changed");
    expect(systemLineText(en, theirs, "Anna")).toBe("Anna cancelled the booking: Car problem");
    expect(systemLineText(is, mine, "Anna")).toBe("Þú afbókaðir: Breyttar áætlanir");
    expect(systemLineText(is, theirs, "Anna")).toBe("Anna afbókaði: Bilun í bíl");
  });

  it("quotes the driver's note after the reason, in each language's quotation marks", () => {
    const noted = {
      key: "cancelled",
      by: "them",
      reason: "car_problem",
      note: "Því miður.",
      wholeTrip: false,
    } as const;
    expect(systemLineText(en, noted, "Anna")).toBe(
      "Anna cancelled the booking: Car problem “Því miður.”",
    );
    expect(systemLineText(is, noted, "Anna")).toBe("Anna afbókaði: Bilun í bíl „Því miður.“");
  });

  it("says the departure changed, from and to the reader's boarding time in Iceland (spec 6, 3.2)", () => {
    const moved = {
      key: "departure_changed",
      from: "2026-11-14T09:00:00.000Z",
      to: "2026-11-14T09:45:00.000Z",
    } as const;
    expect(systemLineText(en, moved, "Anna")).toBe("Departure changed from 09:00 to 09:45");
    expect(systemLineText(is, moved, "Anna")).toBe("Brottför breytt úr 09:00 í 09:45");
  });

  it("says the car changed, by its colour, make and model (spec 6, 3.2)", () => {
    const car = {
      key: "car_changed",
      car: { make: "Volvo", model: "XC40", colour: "red" },
    } as const;
    expect(systemLineText(en, car, "Anna")).toBe("New car: Red Volvo XC40");
    expect(systemLineText(is, car, "Anna")).toBe("Nýr bíll: Rauður Volvo XC40");
  });

  it("says a stop was added, with its time on Iceland's clock (spec 6, 3.2)", () => {
    const line = {
      key: "stop_added",
      stop: "N1 Mosfellsbær",
      plannedAt: "2026-11-14T09:20:00.000Z",
    } as const;
    expect(systemLineText(en, line, "Anna")).toBe("New stop: N1 Mosfellsbær at 09:20");
    expect(systemLineText(is, { ...line, stop: "N1 Mosfellsbæ" }, "Anna")).toBe(
      "Nýr viðkomustaður: N1 Mosfellsbæ kl. 09:20",
    );
  });

  it("says a stop was removed, by its name (spec 6, 3.2)", () => {
    const line = { key: "stop_removed", stop: "N1 Borgarnes" } as const;
    expect(systemLineText(en, line, "Anna")).toBe("Stop removed: N1 Borgarnes");
    expect(systemLineText(is, { ...line, stop: "N1 Borgarnesi" }, "Anna")).toBe(
      "Viðkomustaður felldur niður: N1 Borgarnesi",
    );
  });

  it("says when the driver cancelled the whole trip (spec 6, 3.3)", () => {
    const trip = {
      key: "cancelled",
      by: "them",
      reason: "weather",
      note: "",
      wholeTrip: true,
    } as const;
    expect(systemLineText(en, trip, "Anna")).toBe("Anna cancelled the trip: Weather");
    expect(systemLineText(en, { ...trip, by: "me" }, "Gunna")).toBe(
      "You cancelled the trip: Weather",
    );
    expect(systemLineText(is, trip, "Anna")).toBe("Anna hætti við ferðina: Veður");
    expect(systemLineText(is, { ...trip, by: "me", note: "Því miður." }, "Gunna")).toBe(
      "Þú hættir við ferðina: Veður „Því miður.“",
    );
  });
});

describe("cancellation reasons (spec 6, 3.3 to 3.5)", () => {
  it("have a text in both languages for every reason", () => {
    for (const reason of cancelReasons) {
      for (const t of [en, is]) {
        const text = cancelReasonText(t, reason);
        expect(text).not.toContain("{");
        expect(text.length).toBeGreaterThan(0);
      }
    }
    expect(cancelReasonText(en, "road_closed")).toBe("Road closed");
    expect(cancelReasonText(is, "found_another")).toBe("Fann annað far");
  });
});
