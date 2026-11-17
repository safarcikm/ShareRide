import { fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";
import { LanguageProvider } from "@/i18n/language";
import { paidBooking } from "@/testing/bookings";
import { chatMessage, messageId } from "@/testing/chat";
import { MessageList } from "./message-list";

jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

// Reporting the other person's message (spec 9, 3.1.1): press and hold it,
// a screen reader's action, and on the web a right click or the keyboard's
// menu key, which the browser sends as the same event.
const unkind = chatMessage({
  id: messageId(7),
  text: "Something unkind",
  sentAt: "2026-11-14T11:55:00.000Z",
});
const mine = chatMessage({
  id: messageId(8),
  from: "me",
  text: "Please stop",
  sentAt: "2026-11-14T11:56:00.000Z",
});

async function list(onReport: (id: string) => void) {
  await render(
    <LanguageProvider>
      <MessageList
        booking={paidBooking}
        messages={[unkind, mine]}
        pending={[]}
        onRetry={jest.fn()}
        onReport={(message) => {
          onReport(message.id);
        }}
      />
    </LanguageProvider>,
  );
}

afterEach(() => {
  jest.restoreAllMocks();
  Reflect.deleteProperty(globalThis, "document");
});

describe("Reporting a message on the web", () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, "OS", "web");
    // The language provider names the page's language on the web.
    Object.defineProperty(globalThis, "document", {
      value: { documentElement: { lang: "" } },
      configurable: true,
    });
  });

  it("reports the other person's message on a right click, instead of the browser's menu", async () => {
    const onReport = jest.fn();
    await list(onReport);
    const preventDefault = jest.fn();
    await fireEvent(screen.getByText("Something unkind"), "contextMenu", {
      defaultPrevented: false,
      preventDefault,
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(onReport).toHaveBeenCalledWith(unkind.id);
  });

  it("leaves a press and hold on a touch screen to report it once", async () => {
    const onReport = jest.fn();
    await list(onReport);
    await fireEvent(screen.getByText("Something unkind"), "contextMenu", {
      defaultPrevented: true,
      preventDefault: jest.fn(),
    });
    expect(onReport).not.toHaveBeenCalled();
  });

  it("does not offer my own message", async () => {
    const onReport = jest.fn();
    await list(onReport);
    await fireEvent(screen.getByText("Please stop"), "contextMenu", {
      defaultPrevented: false,
      preventDefault: jest.fn(),
    });
    expect(onReport).not.toHaveBeenCalled();
  });
});
