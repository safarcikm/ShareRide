import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkNote, contactDetailsIn, noteMaxLength } from "./note.ts";

describe("contactDetailsIn (R3.10)", () => {
  it.each([
    ["Call me on 555 1234", "phone"],
    ["Hringdu í 5551234", "phone"],
    ["+354 555-1234 after five", "phone"],
    ["(354) 555 12 34", "phone"],
    ["0044 20 7946 0958", "phone"],
    ["Síminn er 555.1234", "phone"],
    ["Sími 555\u20131234", "phone"],
    ["Sími 555 - 1234", "phone"],
    ["Sími 555  1234", "phone"],
    ["Sími 5 5 5 1 2 3 4", "phone"],
    ["Sími 354 5551234", "phone"],
    ["Write on t.me/anna", "link"],
    ["Messenger m.me/anna.jons", "link"],
    ["bit.ly/annaride", "link"],
    ["linktr.ee/anna", "link"],
    ["Sjá minsida.dk", "link"],
    ["anna.co.uk", "link"],
    ["Write to anna@example.com first", "email"],
    ["Netfang: jón.jónsson@dæmi.is", "email"],
    ["See https://example.com/trip", "link"],
    ["Myndir á www.example.org", "link"],
    ["Facebook hópurinn facebook.com/groups/x", "link"],
    ["Upplýsingar á dæmi.is", "link"],
  ])("finds contact details in %j", (note, kind) => {
    expect(contactDetailsIn(note)).toContain(kind);
  });

  it.each([
    "Leaving from the bus stop, back seat free. Small bags only please.",
    "Ég stoppa í Borgarnesi í 15 mín, kl. 9.30. Verð 5 800 kr.",
    "Two seats, 3 suitcases at most, leaving 2026-11-14 at 09:00.",
    "Fer t.d. um Hvalfjarðargöng, o.s.frv.",
    "Room for 4 and a dog. Stops at 1, 2 and 3.",
    "Ég keyri þessa leið allan veturinn 2025-2026.",
    "Verð 2500-3000 kr. eftir því hvar þú ferð út.",
    "Brottför milli kl. 0800-0930.",
    "Leaving 16.11.2026, back 18.11.2026.",
    "Leaving 4.11.2026, back 6. 11. 2026 or 8/11/2026.",
    "Verð 4000 - 5000 kr.",
    "Ferð nr. 1234567, flug FI204 0745.",
  ])("leaves an ordinary note alone: %j", (note) => {
    expect(contactDetailsIn(note)).toEqual([]);
  });

  it("names each kind once", () => {
    expect(contactDetailsIn("555 1234 or 555 4321, anna@example.com, jon@example.is")).toEqual([
      "phone",
      "email",
    ]);
  });
});

describe("checkNote (R3.10)", () => {
  it("allows an empty note and one of 500 characters", () => {
    expect(checkNote("")).toEqual([]);
    expect(checkNote("þ".repeat(noteMaxLength))).toEqual([]);
  });

  it("refuses a longer note and contact details", () => {
    expect(checkNote("a".repeat(noteMaxLength + 1))).toEqual([{ code: "note_too_long" }]);
    expect(checkNote("Text me: 555 1234")).toEqual([
      { code: "note_has_contact_details", kinds: ["phone"] },
    ]);
  });

  it("finds no contact details in words and short numbers", () => {
    const word = fc.constantFrom("bíll", "sæti", "kl.", "farangur", "seat", "bag", "Akureyri", ",");
    const short = fc.integer({ min: 0, max: 9999 }).map(String);
    fc.assert(
      fc.property(fc.array(fc.oneof(word, word, short), { maxLength: 40 }), (parts) => {
        // Two numbers in a row could read as one long number.
        const text = parts.join(" ").replace(/(\d+) (?=\d)/g, "$1 sæti ");
        expect(contactDetailsIn(text)).toEqual([]);
      }),
    );
  });
});
