import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Button } from "./button";
import { HeldWithMain, PressGuard, useNewPageHolds } from "./press-guard";

// A screen's main button stands in the same place on every screen (spec
// 31, R31.1), so a second press meant for one lands on the next: on the
// way back after an outcome, or on the next step's button. For half a
// second after a main button took a press, and again from when that press
// brought another main button or another page, no main button takes one.

const mockPush = jest.fn<undefined, [unknown]>();
jest.mock("expo-router", () => ({
  router: {
    push: (href: unknown) => {
      mockPush(href);
    },
  },
}));

beforeEach(() => {
  jest.useFakeTimers();
  mockPush.mockClear();
});
afterEach(() => {
  jest.useRealTimers();
});

const button = (name: string) => screen.getByRole("button", { name });
const later = (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms));

/** Sends, and once the answer is let in shows the way back where Send stood. */
function Report({
  onSend,
  onBack,
}: {
  readonly onSend: () => Promise<void>;
  readonly onBack: () => void;
}) {
  const [sent, setSent] = useState(false);
  return sent ? (
    <Button main label="Back to the ride" onPress={onBack} />
  ) : (
    <Button
      main
      label="Send report"
      onPress={() => {
        void onSend().then(() => {
          setSent(true);
        });
      }}
    />
  );
}

describe("PressGuard", () => {
  it("takes no second press on a main button for half a second", async () => {
    const save = jest.fn();
    await render(
      <PressGuard>
        <Button main label="Save" onPress={save} />
      </PressGuard>,
    );
    await fireEvent.press(button("Save"));
    expect(save).toHaveBeenCalledTimes(1);
    // The button says so to a screen reader, and looks as it did.
    expect(button("Save")).toBeDisabled();
    await fireEvent.press(button("Save"));
    expect(save).toHaveBeenCalledTimes(1);

    await later(499);
    expect(button("Save")).toBeDisabled();
    await later(1);
    expect(button("Save")).toBeEnabled();
    await fireEvent.press(button("Save"));
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("holds the main button a press brought in place of the one pressed, from when it comes", async () => {
    let answer: () => void = () => undefined;
    const back = jest.fn();
    await render(
      <PressGuard>
        <Report onSend={() => new Promise<void>((resolve) => (answer = resolve))} onBack={back} />
      </PressGuard>,
    );
    await fireEvent.press(button("Send report"));
    // The answer is slow: the half second after the press has long passed.
    await later(3_000);
    expect(button("Send report")).toBeEnabled();
    await act(async () => {
      answer();
      await Promise.resolve();
    });

    // A press meant for Send lands on the way back, and does nothing.
    expect(button("Back to the ride")).toBeDisabled();
    await fireEvent.press(button("Back to the ride"));
    await later(499);
    await fireEvent.press(button("Back to the ride"));
    expect(back).not.toHaveBeenCalled();
    await later(1);
    expect(button("Back to the ride")).toBeEnabled();
    await fireEvent.press(button("Back to the ride"));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("holds the same button when a press gave it other words", async () => {
    function Toggle({ onPress }: { readonly onPress: (on: boolean) => void }) {
      const [on, setOn] = useState(false);
      return (
        <Button
          main
          label={on ? "Stop" : "Start"}
          onPress={() => {
            onPress(!on);
            setOn(!on);
          }}
        />
      );
    }
    const pressed = jest.fn();
    await render(
      <PressGuard>
        <Toggle onPress={pressed} />
      </PressGuard>,
    );
    await fireEvent.press(button("Start"));
    await fireEvent.press(button("Stop"));
    expect(pressed).toHaveBeenCalledTimes(1);
    await later(500);
    await fireEvent.press(button("Stop"));
    expect(pressed).toHaveBeenCalledTimes(2);
  });

  it("takes a press at once on a main button whose words changed with no press on a main button", async () => {
    function Seats({ onBook }: { readonly onBook: () => void }) {
      const [seats, setSeats] = useState(1);
      return (
        <>
          <Button
            variant="secondary"
            label="One more"
            onPress={() => {
              setSeats(seats + 1);
            }}
          />
          <Button main label={`Book ${String(seats)}`} onPress={onBook} />
        </>
      );
    }
    const book = jest.fn();
    await render(
      <PressGuard>
        <Seats onBook={book} />
      </PressGuard>,
    );
    await fireEvent.press(button("One more"));
    expect(button("Book 2")).toBeEnabled();
    await fireEvent.press(button("Book 2"));
    expect(book).toHaveBeenCalledTimes(1);
  });

  it("holds the main buttons when a press on one opened another page", async () => {
    function Pages({ onPublish }: { readonly onPublish: () => void }) {
      const [page, setPage] = useState("price");
      useNewPageHolds(page);
      return (
        <>
          {/* The page under the one open stays, as a screen does. */}
          <Button
            main
            label="Check your ride"
            onPress={() => {
              // The page comes a moment after the press, as with a slow phone.
              setTimeout(() => {
                setPage("check");
              }, 2_000);
            }}
          />
          <Button main label="Publish ride" onPress={onPublish} />
        </>
      );
    }
    const publish = jest.fn();
    await render(
      <PressGuard>
        <Pages onPublish={publish} />
      </PressGuard>,
    );
    await fireEvent.press(button("Check your ride"));
    await later(2_000);
    expect(button("Publish ride")).toBeDisabled();
    await fireEvent.press(button("Publish ride"));
    expect(publish).not.toHaveBeenCalled();
    await later(500);
    await fireEvent.press(button("Publish ride"));
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("holds the main button of a page a press opened from when it comes, though the page is slow to show it", async () => {
    function Pages({ onPay }: { readonly onPay: () => void }) {
      const [page, setPage] = useState("ride");
      const [read, setRead] = useState(false);
      useNewPageHolds(page);
      if (page === "ride") {
        return (
          <Button
            main
            label="Book"
            onPress={() => {
              // The page opens at once, and reads the ride before it has its button.
              setPage("check");
              setTimeout(() => {
                setRead(true);
              }, 2_000);
            }}
          />
        );
      }
      return read ? <Button main label="Pay" onPress={onPay} /> : null;
    }
    const pay = jest.fn();
    await render(
      <PressGuard>
        <Pages onPay={pay} />
      </PressGuard>,
    );
    await fireEvent.press(button("Book"));
    await later(2_000);
    // A press meant for Book, repeated until something happens, pays nothing.
    expect(button("Pay")).toBeDisabled();
    await fireEvent.press(button("Pay"));
    expect(pay).not.toHaveBeenCalled();
    await later(500);
    await fireEvent.press(button("Pay"));
    expect(pay).toHaveBeenCalledTimes(1);
  });

  it("does not hold on a new page that no press on a main button opened", async () => {
    function Pages({ onPublish }: { readonly onPublish: () => void }) {
      const [page, setPage] = useState("price");
      useNewPageHolds(page);
      return (
        <>
          <Button
            variant="text"
            label="Go on"
            onPress={() => {
              setPage("check");
            }}
          />
          <Button main label="Publish ride" onPress={onPublish} />
        </>
      );
    }
    const publish = jest.fn();
    await render(
      <PressGuard>
        <Pages onPublish={publish} />
      </PressGuard>,
    );
    await fireEvent.press(button("Go on"));
    await fireEvent.press(button("Publish ride"));
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("holds a main button that is a link, which opens nothing meanwhile", async () => {
    await render(
      <PressGuard>
        <Button main label="Save" onPress={jest.fn()} />
        <Button main label="Add a car" href="/drive/cars/new" />
      </PressGuard>,
    );
    await fireEvent.press(button("Save"));
    const link = screen.getByRole("link", { name: "Add a car" });
    expect(link).toBeDisabled();
    await fireEvent.press(link);
    expect(mockPush).not.toHaveBeenCalled();
    await later(500);
    await fireEvent.press(link);
    expect(mockPush).toHaveBeenCalledWith("/drive/cars/new");
    // A link pressed holds the main buttons too, as it opens a page.
    expect(button("Save")).toBeDisabled();
  });

  it("holds the other buttons of a screen's bar with the main ones, and a press on one of them starts no hold", async () => {
    // After "Send request" the bar has "See in My rides" over "Find another
    // ride": the second stands where the button just pressed stood.
    const see = jest.fn();
    const find = jest.fn();
    const inPage = jest.fn();
    function Booking() {
      const [sent, setSent] = useState(false);
      return (
        <>
          <Button variant="text" label="Share" onPress={inPage} />
          <HeldWithMain>
            {sent ? (
              <>
                <Button main label="See in My rides" onPress={see} />
                <Button variant="text" label="Find another ride" onPress={find} />
              </>
            ) : (
              <Button
                main
                label="Send request"
                onPress={() => {
                  setSent(true);
                }}
              />
            )}
          </HeldWithMain>
        </>
      );
    }
    await render(
      <PressGuard>
        <Booking />
      </PressGuard>,
    );
    await fireEvent.press(button("Send request"));
    expect(button("Find another ride")).toBeDisabled();
    await fireEvent.press(button("Find another ride"));
    expect(find).not.toHaveBeenCalled();
    // A button in the page is not in the way of a second press.
    expect(button("Share")).toBeEnabled();
    await fireEvent.press(button("Share"));
    expect(inPage).toHaveBeenCalledTimes(1);

    await later(500);
    expect(button("Find another ride")).toBeEnabled();
    await fireEvent.press(button("Find another ride"));
    expect(find).toHaveBeenCalledTimes(1);
    // Only a main button's press starts a hold.
    expect(button("See in My rides")).toBeEnabled();
    expect(button("Find another ride")).toBeEnabled();
  });

  it("lets a press wait ten seconds for what comes of it, and no longer", async () => {
    let answer: () => void = () => undefined;
    const back = jest.fn();
    await render(
      <PressGuard>
        <Report onSend={() => new Promise<void>((resolve) => (answer = resolve))} onBack={back} />
      </PressGuard>,
    );
    await fireEvent.press(button("Send report"));
    // Nobody presses a second time for a press that long ago.
    await later(10_001);
    await act(async () => {
      answer();
      await Promise.resolve();
    });
    expect(button("Back to the ride")).toBeEnabled();
    await fireEvent.press(button("Back to the ride"));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("goes on waiting while the button pressed is busy under other words, for the button that comes then", async () => {
    // "Book" turns to "Pay 800 kr." while it books, and the payment's own
    // button comes after: that one is where the second press lands.
    function Booking({ onPay }: { readonly onPay: () => void }) {
      const [stage, setStage] = useState<"book" | "booking" | "paying">("book");
      return (
        <>
          <Button
            main
            busy={stage !== "book"}
            label={stage === "book" ? "Book" : "Pay 800 kr."}
            onPress={() => {
              setStage("booking");
              setTimeout(() => {
                setStage("paying");
              }, 2_000);
            }}
          />
          {stage === "paying" ? <Button main label="Pay now" onPress={onPay} /> : null}
        </>
      );
    }
    const pay = jest.fn();
    await render(
      <PressGuard>
        <Booking onPay={pay} />
      </PressGuard>,
    );
    await fireEvent.press(button("Book"));
    await later(2_000);
    expect(button("Pay now")).toBeDisabled();
    await fireEvent.press(button("Pay now"));
    expect(pay).not.toHaveBeenCalled();
    await later(500);
    await fireEvent.press(button("Pay now"));
    expect(pay).toHaveBeenCalledTimes(1);
  });

  it("holds no button in the page but the main ones: the others take a press at once, and start no hold", async () => {
    const keep = jest.fn();
    const cancel = jest.fn();
    await render(
      <PressGuard>
        <Button variant="secondary" label="Keep my booking" onPress={keep} />
        <Button main variant="danger" label="Cancel booking" onPress={cancel} />
      </PressGuard>,
    );
    await fireEvent.press(button("Keep my booking"));
    await fireEvent.press(button("Keep my booking"));
    expect(keep).toHaveBeenCalledTimes(2);
    expect(button("Cancel booking")).toBeEnabled();
    await fireEvent.press(button("Cancel booking"));
    expect(button("Keep my booking")).toBeEnabled();
    await fireEvent.press(button("Keep my booking"));
    expect(keep).toHaveBeenCalledTimes(3);
  });

  it("keeps a held button's look, and shows no press on it", async () => {
    await render(
      <PressGuard>
        <Button main label="Save" onPress={jest.fn()} />
      </PressGuard>,
    );
    const before = screen.getByTestId("button-face").props.style as unknown;
    await fireEvent.press(button("Save"));
    expect(button("Save")).toBeDisabled();
    expect(screen.getByTestId("button-face").props.style).toEqual(before);
  });

  it("keeps the look of a held button under the pointer", async () => {
    await render(
      <PressGuard>
        <Button main label="Save" onPress={jest.fn()} />
      </PressGuard>,
    );
    await fireEvent(button("Save"), "hoverIn");
    const before = screen.getByTestId("button-face").props.style as unknown;
    await fireEvent.press(button("Save"));
    expect(button("Save")).toBeDisabled();
    expect(screen.getByTestId("button-face").props.style).toEqual(before);
  });

  it("holds nothing with no guard around, as in a part's own test", async () => {
    const save = jest.fn();
    await render(<Button main label="Save" onPress={save} />);
    await fireEvent.press(button("Save"));
    await fireEvent.press(button("Save"));
    expect(save).toHaveBeenCalledTimes(2);
    expect(button("Save")).toBeEnabled();
  });

  it("leaves the holding to a guard further out, such as one that holds for no time in tests of whole flows", async () => {
    const save = jest.fn();
    await render(
      <PressGuard holdsFor={0}>
        <PressGuard>
          <Button main label="Save" onPress={save} />
        </PressGuard>
      </PressGuard>,
    );
    await fireEvent.press(button("Save"));
    await fireEvent.press(button("Save"));
    expect(save).toHaveBeenCalledTimes(2);
    expect(button("Save")).toBeEnabled();
  });
});
