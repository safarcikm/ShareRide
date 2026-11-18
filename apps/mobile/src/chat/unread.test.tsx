import { act, render, screen } from "@testing-library/react-native";
import { useEffect } from "react";
import { Platform, Text } from "react-native";
import { UnreadProvider, useUnread } from "./unread";

// The badge's count on the web, where it is asked for again every minute
// while the page is on show. The session is a stand-in: who is signed in,
// and the conversations answer.
const mockSession = {
  state: { status: "signedIn", me: { id: "user-1" } } as {
    status: "signedIn" | "signedOut";
    me?: { id: string };
  },
  manager: { call: jest.fn() },
};
jest.mock("@/auth/session", () => ({
  useSession: () => mockSession.manager,
  useSessionState: () => mockSession.state,
}));

/** Stands in for the browser's page, which may be on show or hidden. */
const page = { visibilityState: "visible" as DocumentVisibilityState };

/** The store as the badge last read it, for a test to ask through. */
let store: ReturnType<typeof useUnread> | undefined;

function Badge() {
  const unread = useUnread();
  useEffect(() => {
    store = unread;
  }, [unread]);
  return <Text testID="total">{unread.total}</Text>;
}

// A new element each time, so a rerender reads the session again.
const app = () => (
  <UnreadProvider>
    <Badge />
  </UnreadProvider>
);

const asked = () => mockSession.manager.call.mock.calls.length;

beforeEach(() => {
  jest.useFakeTimers();
  jest.replaceProperty(Platform, "OS", "web");
  Object.defineProperty(globalThis, "document", { value: page, configurable: true });
  page.visibilityState = "visible";
  mockSession.state = { status: "signedIn", me: { id: "user-1" } };
  mockSession.manager.call.mockReset().mockResolvedValue({
    ok: true,
    data: { conversations: [], unread: 2 },
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  Reflect.deleteProperty(globalThis, "document");
});

describe("The Messages count on the web", () => {
  it("asks again every minute while the page is on show, and not while it is hidden", async () => {
    await render(app());
    expect(asked()).toBe(1);
    expect(await screen.findByText("2")).toBeTruthy();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(asked()).toBe(2);

    page.visibilityState = "hidden";
    await act(async () => {
      await jest.advanceTimersByTimeAsync(180_000);
    });
    expect(asked()).toBe(2);
  });

  it("stops asking, and shows nothing, once signed out", async () => {
    const { rerender } = await render(app());
    expect(await screen.findByText("2")).toBeTruthy();
    mockSession.state = { status: "signedOut" };
    await rerender(app());
    expect(screen.getByTestId("total")).toHaveTextContent("0");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(180_000);
    });
    expect(asked()).toBe(1);
  });

  it("never shows an answer for someone who has since signed out", async () => {
    let answer: (value: unknown) => void = () => undefined;
    mockSession.manager.call.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const { rerender } = await render(app());
    mockSession.state = { status: "signedOut" };
    await rerender(app());
    await act(async () => {
      answer({ ok: true, data: { conversations: [], unread: 5 } });
      await Promise.resolve();
    });
    expect(screen.getByTestId("total")).toHaveTextContent("0");
  });

  it("keeps the newest answer when an older one comes back after it", async () => {
    await render(app());
    expect(await screen.findByText("2")).toBeTruthy();
    const answers: ((value: unknown) => void)[] = [];
    mockSession.manager.call.mockImplementation(
      () =>
        new Promise((resolve) => {
          answers.push(resolve);
        }),
    );
    // Asked twice, as by the list and then once a chat was read.
    await act(async () => {
      void store?.load();
      store?.refresh();
      await Promise.resolve();
    });
    expect(answers).toHaveLength(2);
    await act(async () => {
      answers[1]?.({ ok: true, data: { conversations: [], unread: 0 } });
      await Promise.resolve();
    });
    expect(screen.getByTestId("total")).toHaveTextContent("0");
    // The first, from before the chat was read, still counts its message.
    await act(async () => {
      answers[0]?.({ ok: true, data: { conversations: [], unread: 1 } });
      await Promise.resolve();
    });
    expect(screen.getByTestId("total")).toHaveTextContent("0");
  });
});
