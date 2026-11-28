import { act, renderHook } from "@testing-library/react-native";
import { onWebsite } from "@/lib/on-website";
import { arrivalProps, forgetArrival, motionMark, roomProps, useArrival } from "./motion";
import { whenArrived } from "./motion-sheet";

jest.mock("@/lib/on-website", () => ({ onWebsite: jest.fn(() => true) }));
// The page says when the arrival has ended; the tests say it here.
const mockStopListening = jest.fn();
jest.mock("./motion-sheet", () => ({ whenArrived: jest.fn(() => mockStopListening) }));

/** Says the car has arrived, as the page does when the driver's hop ends. */
function arrive() {
  const [done] = (whenArrived as jest.Mock<() => void, [() => void]>).mock.calls.at(-1) ?? [];
  if (done === undefined) throw new Error("nothing waits for the arrival");
  done();
}

const website = (yes: boolean) => {
  (onWebsite as jest.Mock).mockReturnValue(yes);
};

beforeEach(() => {
  website(true);
  forgetArrival();
});

describe("marks for the website's motion style sheet (spec 33, ADR 0052)", () => {
  it("marks a moving part of a drawing on the website", () => {
    expect(motionMark("car-body")).toEqual({ dataSet: { motion: "car-body" } });
    expect(motionMark("puffin-you")).toEqual({ dataSet: { motion: "puffin-you" } });
  });

  it("marks an arriving car with how far left it starts", () => {
    expect(arrivalProps(-250)).toEqual({
      dataSet: { motion: "arrive" },
      style: { "--from": "-250px" },
    });
    expect(arrivalProps(null)).toEqual({});
  });

  it("marks the car's room on a laptop only while it arrives", () => {
    expect(roomProps(true)).toEqual({ dataSet: { motion: "arrive-room" } });
    expect(roomProps(false)).toEqual({});
  });

  it("marks nothing in the phone apps, which keep the car still for now (3.11)", () => {
    website(false);
    expect(motionMark("car-body")).toEqual({});
    expect(arrivalProps(-250)).toEqual({});
    expect(roomProps(true)).toEqual({});
  });
});

describe("useArrival (spec 33, 3.2: once a visit)", () => {
  beforeEach(() => {
    (whenArrived as jest.Mock).mockClear();
    mockStopListening.mockClear();
  });

  it("arrives the first time Find shows, until the page says the arrival is over", async () => {
    const { result } = await renderHook(() => useArrival());
    expect(result.current).toBe(true);
    expect(whenArrived).toHaveBeenCalledTimes(1);
    await act(() => {
      arrive();
    });
    expect(result.current).toBe(false);
    expect(mockStopListening).toHaveBeenCalled();
  });

  it("stops waiting when Find goes before the car has arrived", async () => {
    const { unmount } = await renderHook(() => useArrival());
    await unmount();
    expect(mockStopListening).toHaveBeenCalledTimes(1);
  });

  it("does not arrive again when Find shows again in the same visit", async () => {
    const first = await renderHook(() => useArrival());
    await first.unmount();
    const again = await renderHook(() => useArrival());
    expect(again.result.current).toBe(false);
    expect(whenArrived).toHaveBeenCalledTimes(1);
  });

  it("never arrives in the phone apps yet", async () => {
    website(false);
    const { result } = await renderHook(() => useArrival());
    expect(result.current).toBe(false);
    expect(whenArrived).not.toHaveBeenCalled();
  });
});
