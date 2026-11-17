import { describe, expect, it } from "vitest";
import {
  capitalised,
  formatClock,
  formatCount,
  formatDate,
  formatDay,
  formatDayAndMonth,
  formatDistance,
  formatDuration,
  formatMoney,
  formatMonth,
  formatShortDay,
  formatWeekdays,
} from "./format.ts";

describe("formatCount", () => {
  it("groups thousands with each language's mark", () => {
    expect(formatCount(650, "en")).toBe("650");
    expect(formatCount(90_300, "en")).toBe("90,300");
    expect(formatCount(90_300, "is")).toBe("90.300");
  });
});

describe("formatMoney (ADR 0011)", () => {
  it("shows whole krónur in Icelandic as 2.500 kr.", () => {
    expect(formatMoney({ amount: 2500, currency: "ISK" }, "is")).toBe("2.500 kr.");
  });

  it("shows whole krónur in English as 2,500 ISK", () => {
    expect(formatMoney({ amount: 2500, currency: "ISK" }, "en")).toBe("2,500 ISK");
  });

  it("shows a free trip as 0", () => {
    expect(formatMoney({ amount: 0, currency: "ISK" }, "en")).toBe("0 ISK");
  });

  it("groups every three digits, and none under a thousand", () => {
    expect(formatMoney({ amount: 900, currency: "ISK" }, "is")).toBe("900 kr.");
    expect(formatMoney({ amount: 1_234_500, currency: "ISK" }, "is")).toBe("1.234.500 kr.");
    expect(formatMoney({ amount: 1_234_500, currency: "ISK" }, "en")).toBe("1,234,500 ISK");
  });
});

describe("formatDistance", () => {
  it("rounds short distances to 100 m, and shows at least 100 m", () => {
    expect(formatDistance(0, "en")).toBe("100 m");
    expect(formatDistance(349, "en")).toBe("300 m");
    expect(formatDistance(940, "is")).toBe("900 m");
  });

  it("shows kilometres with one decimal under 10 km", () => {
    expect(formatDistance(950, "en")).toBe("1 km");
    expect(formatDistance(2440, "en")).toBe("2.4 km");
    expect(formatDistance(2440, "is")).toBe("2,4 km");
    expect(formatDistance(9949, "is")).toBe("9,9 km");
    expect(formatDistance(3000, "is")).toBe("3 km");
  });

  it("shows whole kilometres from 10 km", () => {
    expect(formatDistance(9960, "en")).toBe("10 km");
    expect(formatDistance(385_400, "en")).toBe("385 km");
    expect(formatDistance(1_385_400, "is")).toBe("1.385 km");
  });
});

describe("formatMonth", () => {
  it("names a month (1 to 12) as it reads in a sentence", () => {
    expect(formatMonth(5, "en")).toBe("May");
    expect(formatMonth(5, "is")).toBe("maí");
    expect(formatMonth(12, "is")).toBe("desember");
    expect(formatMonth(1, "en")).toBe("January");
  });

  it("refuses a month that does not exist", () => {
    expect(() => formatMonth(13, "en")).toThrow(RangeError);
  });
});

describe("formatDate", () => {
  it("shows a calendar date with the month in words", () => {
    expect(formatDate("2026-11-14", "en")).toBe("14 November 2026");
    expect(formatDate("2026-11-14", "is")).toBe("14. nóvember 2026");
  });

  it("does not move the date in any time zone", () => {
    expect(formatDate("2026-01-01", "en")).toBe("1 January 2026");
  });
});

describe("formatShortDay", () => {
  it("shows a calendar date briefly, with its weekday", () => {
    expect(formatShortDay("2026-11-20", "en")).toBe("Fri 20 Nov");
    expect(formatShortDay("2026-11-20", "is")).toBe("fös. 20. nóv.");
    expect(formatShortDay("2027-05-03", "is")).toBe("mán. 3. maí");
    expect(formatShortDay("2026-11-15", "en")).toBe("Sun 15 Nov");
  });
});

describe("formatDay", () => {
  it("names the weekday and date in Iceland", () => {
    const moment = new Date("2026-11-15T23:30:00Z");
    expect(formatDay(moment, "en")).toBe("Sunday 15 November");
    expect(formatDay(moment, "is")).toBe("sunnudagur 15. nóvember");
  });

  it("names every weekday of a week from Monday", () => {
    const week = Array.from(
      { length: 7 },
      (_, index) => new Date(Date.UTC(2026, 10, 16 + index, 12)),
    );
    expect(week.map((moment) => formatDay(moment, "is"))).toEqual([
      "mánudagur 16. nóvember",
      "þriðjudagur 17. nóvember",
      "miðvikudagur 18. nóvember",
      "fimmtudagur 19. nóvember",
      "föstudagur 20. nóvember",
      "laugardagur 21. nóvember",
      "sunnudagur 22. nóvember",
    ]);
    expect(formatDay(new Date("2027-01-01T00:00:00Z"), "en")).toBe("Friday 1 January");
  });
});

describe("formatDayAndMonth", () => {
  it("names the day and month in Iceland, without a weekday to decline", () => {
    const moment = new Date("2026-11-23T23:30:00Z");
    expect(formatDayAndMonth(moment, "en")).toBe("23 November");
    expect(formatDayAndMonth(moment, "is")).toBe("23. nóvember");
    expect(formatDayAndMonth(new Date("2027-01-01T00:00:00Z"), "is")).toBe("1. janúar");
  });
});

describe("capitalised", () => {
  it("puts a capital at the start of a line, Icelandic letters too", () => {
    expect(capitalised("sunnudagur 15. nóvember kl. 09:00", "is")).toBe(
      "Sunnudagur 15. nóvember kl. 09:00",
    );
    expect(capitalised("þriðjudagur", "is")).toBe("Þriðjudagur");
    expect(capitalised("ágúst", "is")).toBe("Ágúst");
    expect(capitalised("", "en")).toBe("");
  });
});

describe("formatClock", () => {
  it("shows the time on a 24-hour clock in Iceland", () => {
    expect(formatClock(new Date("2026-11-15T07:05:00Z"))).toBe("07:05");
    expect(formatClock(new Date("2026-11-15T23:59:59Z"))).toBe("23:59");
  });
});

describe("formatDuration", () => {
  it("shows minutes, or hours and minutes, rounded to the minute", () => {
    expect(formatDuration(45 * 60 + 20, "en")).toBe("45 min");
    expect(formatDuration(3600, "en")).toBe("1 h");
    expect(formatDuration(5 * 3600 + 10 * 60 + 40, "en")).toBe("5 h 11 min");
    expect(formatDuration(5 * 3600 + 10 * 60, "is")).toBe("5 klst. 10 mín.");
    expect(formatDuration(20, "is")).toBe("0 mín.");
  });
});

describe("formatWeekdays", () => {
  it("names the days of the week from Monday", () => {
    expect(formatWeekdays("en")).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(formatWeekdays("is")).toEqual(["mán.", "þri.", "mið.", "fim.", "fös.", "lau.", "sun."]);
  });
});
