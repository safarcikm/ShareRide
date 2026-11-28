import { describe, expect, it } from "vitest";
import {
  bannerFor,
  easterSunday,
  parseCalendarDate,
  yuleLads,
  type BannerDay,
  type CalendarDate,
} from "./banner.ts";

/** "2027-06-17" as a calendar date. */
function date(text: string): CalendarDate {
  const [year, month, day] = text.split("-").map(Number);
  return { year: year ?? 0, month: month ?? 0, day: day ?? 0 };
}

const withDays = { festiveDays: true } as const;
const dayOn = (text: string) => bannerFor(date(text), withDays).day;
const seasonOn = (text: string) => bannerFor(date(text), withDays).season;

describe("easterSunday", () => {
  it.each([
    [2026, "2026-04-05"],
    [2027, "2027-03-28"],
    [2028, "2028-04-16"],
    [2029, "2029-04-01"],
    [2030, "2030-04-21"],
    [2031, "2031-04-13"],
    [2032, "2032-03-28"],
    [2033, "2033-04-17"],
    [2034, "2034-04-09"],
    [2035, "2035-03-25"],
    [2036, "2036-04-13"],
    [2037, "2037-04-05"],
    [2038, "2038-04-25"],
  ])("is right in %i", (year, sunday) => {
    expect(easterSunday(year)).toEqual(date(sunday));
  });
});

/** One date a year, 2026 to 2036, for a day of one date. */
const years = [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035, 2036] as const;
const oneDays: readonly (readonly [BannerDay, readonly string[]])[] = [
  [
    "summerday",
    [
      "04-23",
      "04-22",
      "04-20",
      "04-19",
      "04-25",
      "04-24",
      "04-22",
      "04-21",
      "04-20",
      "04-19",
      "04-24",
    ],
  ],
  [
    "winterday",
    [
      "10-24",
      "10-23",
      "10-21",
      "10-27",
      "10-26",
      "10-25",
      "10-23",
      "10-22",
      "10-21",
      "10-27",
      "10-25",
    ],
  ],
  [
    "bondadagur",
    [
      "01-23",
      "01-22",
      "01-21",
      "01-19",
      "01-25",
      "01-24",
      "01-23",
      "01-21",
      "01-20",
      "01-19",
      "01-25",
    ],
  ],
  [
    "konudagur",
    [
      "02-22",
      "02-21",
      "02-20",
      "02-18",
      "02-24",
      "02-23",
      "02-22",
      "02-20",
      "02-19",
      "02-18",
      "02-24",
    ],
  ],
];

describe("the days of one date (spec 36, 3.4 and 3.5)", () => {
  describe.each(oneDays)("%s", (day, dates) => {
    it.each(years.map((year, index) => `${String(year)}-${dates[index] ?? ""}`))(
      "is on %s, and not the day before or after",
      (text) => {
        expect(dayOn(text)).toBe(day);
        const { year, month, day: of } = date(text);
        const before = bannerFor({ year, month, day: of - 1 }, withDays).day;
        const after = bannerFor({ year, month, day: of + 1 }, withDays).day;
        expect(before).not.toBe(day);
        expect(after).not.toBe(day);
      },
    );
  });

  it("puts Bolludagur 48 days and Öskudagur 46 days before Easter Sunday", () => {
    expect(dayOn("2027-02-08")).toBe("bolludagur");
    expect(dayOn("2027-02-10")).toBe("oskudagur");
    expect(dayOn("2038-03-08")).toBe("bolludagur");
    expect(dayOn("2038-03-10")).toBe("oskudagur");
    expect(dayOn("2027-02-09")).toBeNull();
  });

  it("knows the fixed days", () => {
    expect(dayOn("2027-06-17")).toBe("june17");
    expect(dayOn("2027-12-01")).toBe("dec1");
    expect(dayOn("2027-12-31")).toBe("newyear");
    expect(dayOn("2028-01-01")).toBe("newyear");
  });

  it("puts Seafarers' Day on the first Sunday of June", () => {
    expect(dayOn("2027-06-06")).toBe("seafarers");
    expect(dayOn("2029-06-03")).toBe("seafarers");
  });

  it.each(["2028-06-11", "2031-06-08", "2033-06-12", "2036-06-08"])(
    "moves Seafarers' Day to the second Sunday when the first is Whitsunday (%s)",
    (text) => {
      expect(dayOn(text)).toBe("seafarers");
      const { year, month, day } = date(text);
      expect(bannerFor({ year, month, day: day - 7 }, withDays).day).toBeNull();
    },
  );
});

describe("the days of several dates", () => {
  it("has Easter from Maundy Thursday to Easter Monday", () => {
    for (const text of ["2027-03-25", "2027-03-26", "2027-03-27", "2027-03-28", "2027-03-29"]) {
      expect(dayOn(text)).toBe("easter");
    }
    expect(dayOn("2027-03-24")).toBeNull();
    expect(dayOn("2027-03-30")).toBeNull();
  });

  it("has the long weekend from the Wednesday before the first Monday of August", () => {
    for (const text of ["2027-07-28", "2027-07-31", "2027-08-01", "2027-08-02"]) {
      expect(dayOn(text)).toBe("longweekend");
    }
    expect(dayOn("2027-07-27")).toBeNull();
    expect(dayOn("2027-08-03")).toBeNull();
  });

  it("has Christmas from 12 to 30 December and from 2 to 6 January", () => {
    for (const text of ["2027-12-12", "2027-12-24", "2027-12-30", "2028-01-02", "2028-01-06"]) {
      expect(dayOn(text)).toBe("christmas");
    }
    expect(dayOn("2027-12-11")).toBeNull();
    expect(dayOn("2028-01-07")).toBeNull();
  });
});

describe("the seasons (spec 36, 3.2)", () => {
  it.each([
    ["2027-03-31", "winter"],
    ["2027-04-01", "spring"],
    ["2027-05-31", "spring"],
    ["2027-06-01", "summer"],
    ["2027-08-31", "summer"],
    ["2027-09-01", "autumn"],
    ["2027-10-22", "autumn"],
    ["2027-10-24", "winter"],
    ["2027-11-15", "winter"],
  ] as const)("%s is %s", (text, season) => {
    expect(seasonOn(text)).toBe(season);
  });

  it("shows only the season with the festive days off", () => {
    expect(bannerFor(date("2027-12-25"), { festiveDays: false })).toEqual({
      season: "winter",
      day: null,
      yule: null,
    });
    expect(bannerFor(date("2027-10-23"), { festiveDays: false })).toEqual({
      season: "winter",
      day: null,
      yule: null,
    });
  });
});

describe("the scene a day is drawn in", () => {
  it("is the day's own, not the date's", () => {
    // Maundy Thursday in March is spring, though March is winter.
    expect(bannerFor(date("2027-03-25"), withDays)).toMatchObject({
      season: "spring",
      day: "easter",
    });
    // The first day of winter is autumn's land, which turns white.
    expect(bannerFor(date("2027-10-23"), withDays)).toMatchObject({
      season: "autumn",
      day: "winterday",
    });
    expect(bannerFor(date("2027-06-06"), withDays)).toMatchObject({
      season: "summer",
      day: "seafarers",
    });
    expect(bannerFor(date("2027-12-01"), withDays)).toMatchObject({
      season: "winter",
      day: "dec1",
    });
  });
});

describe("two days together", () => {
  it("shows the day of one date", () => {
    // 2038: Maundy Thursday is also the first day of summer.
    expect(dayOn("2038-04-22")).toBe("summerday");
    expect(dayOn("2027-12-31")).toBe("newyear");
  });
});

describe("the Yule Lads and Jólakötturinn (spec 36, 3.11; R36.8)", () => {
  const yuleOn = (text: string) => bannerFor(date(text), withDays).yule;

  it("has the thirteen Lads in the order of Jóhannes úr Kötlum's poem", () => {
    expect(yuleLads).toEqual([
      "stekkjastaur",
      "giljagaur",
      "stufur",
      "thvorusleikir",
      "pottaskefill",
      "askasleikir",
      "hurdaskellir",
      "skyrgamur",
      "bjugnakraekir",
      "gluggagaegir",
      "gattathefur",
      "ketkrokur",
      "kertasnikir",
    ]);
  });

  it.each([2026, 2027, 2030, 2036])(
    "brings one Lad a night from 12 to 24 December %i",
    (year) => {
      yuleLads.forEach((lad, n) => {
        expect(bannerFor({ year, month: 12, day: 12 + n }, withDays).yule?.lad).toBe(lad);
      });
    },
  );

  it("shows the cat from Christmas Eve, not before", () => {
    expect(yuleOn("2027-12-23")).toEqual({ lad: "ketkrokur", cat: false });
    expect(yuleOn("2027-12-24")).toEqual({ lad: "kertasnikir", cat: true });
  });

  it.each(["2027-12-25", "2027-12-26", "2027-12-30", "2028-01-02", "2028-01-06"])(
    "leaves the cat alone on %s",
    (text) => {
      expect(yuleOn(text)).toEqual({ lad: null, cat: true });
    },
  );

  it("keeps the cat with New Year's fireworks", () => {
    expect(bannerFor(date("2027-12-31"), withDays)).toEqual({
      season: "winter",
      day: "newyear",
      yule: { lad: null, cat: true },
    });
    expect(bannerFor(date("2028-01-01"), withDays).yule).toEqual({ lad: null, cat: true });
  });

  it.each(["2027-12-11", "2028-01-07", "2027-12-01", "2027-06-17", "2027-11-30"])(
    "shows neither on %s",
    (text) => {
      expect(yuleOn(text)).toBeNull();
    },
  );

  it("shows neither with the festive days off", () => {
    for (const text of ["2027-12-12", "2027-12-24", "2027-12-31", "2028-01-06"]) {
      expect(bannerFor(date(text), { festiveDays: false }).yule).toBeNull();
    }
  });
});

describe("parseCalendarDate", () => {
  it("reads a date written YYYY-MM-DD", () => {
    expect(parseCalendarDate("2027-06-17")).toEqual({ year: 2027, month: 6, day: 17 });
  });

  it.each(["2027-02-30", "2027-6-17", "banana", "", "1999-01-01", "2027-13-01", " 2027-06-17"])(
    "refuses %j",
    (text) => {
      expect(parseCalendarDate(text)).toBeNull();
    },
  );
});
