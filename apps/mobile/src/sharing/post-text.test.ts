import { plannedDraft } from "@/testing/trips";
import { facebookShareAddress, puffinRideFacebookPage } from "./links";
import { postText } from "./post-text";

const url = "https://puffinride.is/trips/0190a1d6-0000-7000-8000-000000000201?from=0&to=2";
const published = plannedDraft({ status: "published", publishedAt: "2026-11-14T11:00:00.000Z" });

describe("The text for a driver's post (spec 28, 3.4)", () => {
  it("says the route, the day and time, the stops between and the link, in English", () => {
    const post = postText({ ...published, bookingMode: "instant" }, "en", url);
    expect(post.text).toBe(
      [
        "Offering a ride: BSÍ bus terminal → Hof, Akureyri",
        "Sunday 15 November at 09:00",
        "Stops on the way: Borgarnes",
        `Book a seat on PuffinRide: ${url}`,
      ].join("\n"),
    );
    // For a share window, which takes the link apart from the words.
    expect(post.withoutLink).toBe(
      [
        "Offering a ride: BSÍ bus terminal → Hof, Akureyri",
        "Sunday 15 November at 09:00",
        "Stops on the way: Borgarnes",
        "Book a seat on PuffinRide:",
      ].join("\n"),
    );
    expect(post.title).toBe("BSÍ bus terminal → Hof, Akureyri on PuffinRide");
  });

  it("asks for a seat where the driver approves each one, in Icelandic, without stops between", () => {
    const direct = { ...published, bookingMode: "approval" as const };
    const post = postText(
      { ...direct, stops: [direct.stops[0], direct.stops[2]].filter((stop) => stop !== undefined) },
      "is",
      url,
    );
    expect(post.text).toBe(
      [
        "Býð far: BSÍ umferðarmiðstöð → Hof, Akureyri",
        "Sunnudagur 15. nóvember kl. 09:00",
        `Óskaðu eftir sæti á PuffinRide: ${url}`,
      ].join("\n"),
    );
  });

  it("never says a price, a fee, a payment, a seat count or the driver's note (R28.2)", () => {
    const priced = {
      ...published,
      note: "Room for skis",
      seats: 3,
      segments: [3400, 2100].map((amount) => ({
        distanceM: 100_000,
        durationS: 3600,
        suggestedPrice: { amount, currency: "ISK" as const },
        cap: { amount: amount * 2, currency: "ISK" as const },
        price: { amount, currency: "ISK" as const },
        seatsTaken: 1,
      })),
      takings: { amount: 5500, currency: "ISK" as const },
    };
    for (const locale of ["en", "is"] as const) {
      const { text, withoutLink, title } = postText(priced, locale, url);
      for (const words of [text, withoutLink, title]) {
        expect(words).not.toMatch(
          /kr\b|ISK|fee|gjald|greið|pay|seats? (left|free)|laus sæti|skis|3\s?400|2\s?100|5\s?500/i,
        );
      }
    }
  });
});

describe("Facebook's links (spec 28, 3.3 and 3.6)", () => {
  it("opens Facebook's share window for the link, and nothing more", () => {
    expect(facebookShareAddress(url)).toBe(
      "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fpuffinride.is%2Ftrips%2F0190a1d6-0000-7000-8000-000000000201%3Ffrom%3D0%26to%3D2",
    );
  });

  it("knows PuffinRide's Page", () => {
    expect(puffinRideFacebookPage).toBe("https://www.facebook.com/profile.php?id=61597055066444");
  });
});
