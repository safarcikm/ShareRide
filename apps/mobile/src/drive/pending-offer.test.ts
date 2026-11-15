import { keepPendingBooking, takePendingBooking } from "@/booking/pending-booking";
import { keepPendingOffer, takePendingOffer } from "./pending-offer";

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
