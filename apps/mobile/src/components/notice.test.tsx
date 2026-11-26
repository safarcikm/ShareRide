import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { Button } from "./button";
import { ActionNotice, useSaid } from "./notice";

/** A form whose main button never does what it says, and says why. */
function Form({ why }: { readonly why: string }) {
  const [said, say] = useSaid();
  return (
    <>
      <ActionNotice says={said} />
      <Button
        main
        label="Send"
        onPress={() => {
          say(why);
        }}
      />
      <Button
        variant="secondary"
        label="Mend"
        onPress={() => {
          say(null);
        }}
      />
    </>
  );
}

const send = () => fireEvent.press(screen.getByRole("button", { name: "Send" }));

describe("ActionNotice", () => {
  it("shows nothing until there is something to say", async () => {
    await render(<Form why="Choose a reason." />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says why the button did nothing, and takes focus", async () => {
    const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    await render(<Form why="Choose a reason." />);
    focus.mockClear();
    await send();
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a reason.");
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("takes focus again when another press gets the same words", async () => {
    // A screen reader heard them once; a second press that changes nothing
    // on the screen would otherwise be silent.
    const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    await render(<Form why="Choose a reason." />);
    await send();
    focus.mockClear();
    await send();
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a reason.");
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("takes focus when it says something new", async () => {
    const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    const view = await render(<Form why="Choose a reason." />);
    await send();
    await view.rerender(<Form why="Keep the note to 500 characters." />);
    focus.mockClear();
    await send();
    expect(screen.getByRole("alert")).toHaveTextContent("Keep the note to 500 characters.");
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("leaves focus alone when the screen is only drawn again", async () => {
    const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    const view = await render(<Form why="Choose a reason." />);
    await send();
    focus.mockClear();
    await view.rerender(<Form why="Choose a reason." />);
    expect(focus).not.toHaveBeenCalled();
  });

  it("goes once what it said is mended", async () => {
    await render(<Form why="Choose a reason." />);
    await send();
    await fireEvent.press(screen.getByRole("button", { name: "Mend" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("takes plain words, as from a call that failed, and focus with them", async () => {
    const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    const view = await render(<ActionNotice says={null} />);
    focus.mockClear();
    await view.rerender(<ActionNotice says="Something went wrong. Try again." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Try again.");
    expect(focus).toHaveBeenCalledTimes(1);
  });
});
