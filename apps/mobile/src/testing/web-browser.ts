// Stands in for expo-web-browser, which opens Google's or Apple's sign-in
// in the phone's browser sheet or a pop-up on the web: a test says where
// the window comes back to, or that the person closed it.

type AuthSessionResult =
  { type: "success"; url: string } | { type: "cancel" } | { type: "dismiss" };

let answer: (startUrl: string) => AuthSessionResult = () => ({ type: "cancel" });

export const openAuthSessionAsync = jest.fn(
  (startUrl: string, _returnUrl?: string, _options?: unknown) => Promise.resolve(answer(startUrl)),
);
export const dismissAuthSession = jest.fn();
export const maybeCompleteAuthSession = jest.fn((_options?: unknown) => ({
  type: "failed",
  message: "Not in a pop-up",
}));

/** From here on, the window comes back to this address, or is closed with null. */
export function windowReturnsTo(url: string | ((startUrl: string) => string) | null): void {
  answer = (startUrl) =>
    url === null
      ? { type: "cancel" }
      : { type: "success", url: typeof url === "string" ? url : url(startUrl) };
}
