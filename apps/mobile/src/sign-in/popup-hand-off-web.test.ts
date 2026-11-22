import { maybeCompleteAuthSession } from "@/testing/web-browser";
import { handOffProviderPopup } from "./popup-hand-off.web";

// The web's pop-up, run here with a stand-in window: its address, its
// history and the window that opened it. The file is named without ".web",
// which Jest keeps for web runs, so it runs with the others.

const ticket = `sr_pt_${"t".repeat(43)}`;
const replaceState = jest.fn();
const saved = ["location", "history", "opener"].map(
  (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
);

function inWindow(href: string, opener: unknown) {
  const url = new URL(href);
  const values = {
    location: { href: url.href, pathname: url.pathname, origin: url.origin },
    history: { replaceState },
    opener,
  };
  for (const [name, value] of Object.entries(values)) {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
}

const ours = { location: { origin: "https://web.test" } };
const handedOver = () => ({ type: "success", message: "Attempting to complete auth" });

afterEach(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
    else Object.defineProperty(globalThis, name, descriptor);
  }
});

describe("handOffProviderPopup", () => {
  it("hands the answer to this app's window, then takes the ticket out of the address", () => {
    inWindow(`https://web.test/sign-in/return#ticket=${ticket}`, ours);
    maybeCompleteAuthSession.mockImplementationOnce(handedOver);
    expect(handOffProviderPopup()).toBe(true);
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/sign-in/return");
    // Handed over while the address still had it.
    expect(maybeCompleteAuthSession.mock.invocationCallOrder.at(-1)).toBeLessThan(
      replaceState.mock.invocationCallOrder.at(-1) ?? 0,
    );
  });

  it("hands nothing to another site's window, nor without one, and still clears the address", () => {
    const theirs = {
      get location(): never {
        throw new Error("Blocked a frame with origin from accessing a cross-origin frame");
      },
    };
    const calls = maybeCompleteAuthSession.mock.calls.length;
    for (const opener of [theirs, null, { location: { origin: "https://other.test" } }]) {
      inWindow(`https://web.test/sign-in/return#ticket=${ticket}`, opener);
      replaceState.mockClear();
      expect(handOffProviderPopup()).toBe(false);
      expect(replaceState).toHaveBeenCalledWith(null, "", "/sign-in/return");
    }
    expect(maybeCompleteAuthSession.mock.calls).toHaveLength(calls);
  });

  it("is not handed over when the opener has no sign-in waiting, or is gone", () => {
    inWindow(`https://web.test/sign-in/return#ticket=${ticket}`, ours);
    expect(handOffProviderPopup()).toBe(false);
    maybeCompleteAuthSession.mockImplementationOnce(() => {
      throw new Error("ERR_WEB_BROWSER_REDIRECT");
    });
    expect(handOffProviderPopup()).toBe(false);
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/sign-in/return");
  });

  it("leaves every other page alone", () => {
    inWindow("https://web.test/sign-in#x", ours);
    replaceState.mockClear();
    expect(handOffProviderPopup()).toBe(false);
    expect(replaceState).not.toHaveBeenCalled();
  });
});
