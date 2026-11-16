import {
  keepPendingBooking,
  peekPendingBooking,
  takePendingBooking,
} from "@/booking/pending-booking";
import { keepPendingOffer, peekPendingOffer, takePendingOffer } from "./pending-offer";

// The app's own storage, in memory.
const mockStored = new Map<string, string>();
jest.mock("@/lib/app-data", () => ({
  readAppData: jest.fn((key: string) => Promise.resolve(mockStored.get(key) ?? null)),
  writeAppData: jest.fn((key: string, value: string) => {
    mockStored.set(key, value);
    return Promise.resolve();
  }),
}));

const noon = new Date("2026-11-14T12:00:00Z");
const minutesLater = (minutes: number) => new Date(noon.getTime() + minutes * 60_000);
const booking = { tripId: "0190a1d6-0000-7000-8000-0000000000d1", board: 1, alight: 2, seats: 1 };

beforeEach(() => {
  mockStored.clear();
});

describe("an offer kept while someone signs up", () => {
  it("is taken once", async () => {
    await keepPendingOffer(noon);
    expect(await takePendingOffer(minutesLater(10))).toBe(true);
    expect(await takePendingOffer(minutesLater(11))).toBe(false);
  });

  it("is forgotten after an hour", async () => {
    await keepPendingOffer(noon);
    expect(await takePendingOffer(minutesLater(61))).toBe(false);
  });

  it("is not there unless kept, or when the stored value is damaged", async () => {
    expect(await takePendingOffer(noon)).toBe(false);
    mockStored.set("pending-offer", "{not json");
    expect(await takePendingOffer(noon)).toBe(false);
  });

  it("gives way to a booking chosen after it, and the other way round", async () => {
    await keepPendingOffer(noon);
    await keepPendingBooking(booking, minutesLater(1));
    expect(await takePendingOffer(minutesLater(2))).toBe(false);
    expect(await takePendingBooking(minutesLater(2))).toEqual(booking);

    await keepPendingBooking(booking, minutesLater(3));
    await keepPendingOffer(minutesLater(4));
    expect(await takePendingBooking(minutesLater(5))).toBeNull();
    expect(await takePendingOffer(minutesLater(5))).toBe(true);
  });
});

describe("looking at what is kept, for the sign-up steps (spec 16, 3.5)", () => {
  it("shows the booking without taking it, until the hour is up", async () => {
    await keepPendingBooking(booking, noon);
    expect(await peekPendingBooking(minutesLater(10))).toEqual(booking);
    expect(await peekPendingBooking(minutesLater(20))).toEqual(booking);
    expect(await peekPendingBooking(minutesLater(61))).toBeNull();
    expect(await takePendingBooking(minutesLater(30))).toEqual(booking);
    expect(await peekPendingBooking(minutesLater(31))).toBeNull();
  });

  it("shows the offer without taking it, until the hour is up", async () => {
    expect(await peekPendingOffer(noon)).toBe(false);
    await keepPendingOffer(noon);
    expect(await peekPendingOffer(minutesLater(10))).toBe(true);
    expect(await peekPendingOffer(minutesLater(61))).toBe(false);
    expect(await takePendingOffer(minutesLater(30))).toBe(true);
    expect(await peekPendingOffer(minutesLater(31))).toBe(false);
  });
});
