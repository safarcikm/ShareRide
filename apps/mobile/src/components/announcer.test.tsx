import { render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Platform } from "react-native";
import { Announcer } from "./announcer";

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Announcer", () => {
  it("reads each message out on a phone, the same words again too", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const view = await render(<Announcer message={{ text: "Link copied", count: 1 }} />);
    await view.rerender(<Announcer message={{ text: "Link copied", count: 2 }} />);
    expect(announce.mock.calls).toEqual([["Link copied"], ["Link copied"]]);
  });

  it("puts each message in a new element on the web, so the same words are read again", async () => {
    jest.replaceProperty(Platform, "OS", "web");
    const view = await render(<Announcer message={{ text: "Link copied", count: 1 }} />);
    const first = screen.getByText("Link copied");
    await view.rerender(<Announcer message={{ text: "Link copied", count: 2 }} />);
    expect(screen.getByText("Link copied")).not.toBe(first);
  });
});
