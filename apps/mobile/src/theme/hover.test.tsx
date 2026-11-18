import { act, renderHook } from "@testing-library/react-native";
import { useHover } from "./hover";

describe("useHover", () => {
  it("is on while the pointer is over the part", async () => {
    const { result } = await renderHook(() => useHover());
    expect(result.current[0]).toBe(false);
    await act(() => {
      result.current[1].onHoverIn();
    });
    expect(result.current[0]).toBe(true);
    await act(() => {
      result.current[1].onHoverOut();
    });
    expect(result.current[0]).toBe(false);
  });

  it("is off for a part that is turned off, and forgets the pointer", async () => {
    const { result, rerender } = await renderHook(({ off }: { off: boolean }) => useHover(off), {
      initialProps: { off: false },
    });
    await act(() => {
      result.current[1].onHoverIn();
    });
    await rerender({ off: true });
    expect(result.current[0]).toBe(false);
    // The pointer left while the part heard nothing of it.
    await rerender({ off: false });
    expect(result.current[0]).toBe(false);
  });
});
