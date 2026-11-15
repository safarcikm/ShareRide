import { describe, expect, it } from "vitest";
import { createFakePushSender, createUnconnectedPushSender, type PushMessage } from "./push.ts";

const message: PushMessage = {
  to: "ExponentPushToken[test]",
  title: "New request: Jón",
  body: "1 seat · BSÍ – N1 Borgarnes",
  data: { path: "/drive/trips/trip-1" },
};

describe("push senders", () => {
  it("the fake records what it sends and gives each message a ticket", async () => {
    const push = createFakePushSender();
    expect(await push.send([message, message])).toEqual([
      { status: "ok", id: "ticket-1" },
      { status: "ok", id: "ticket-2" },
    ]);
    push.failure = new Error("down");
    await expect(push.send([message])).rejects.toThrow("down");
    expect(push.sent).toEqual([message, message]);
    expect(push.attempts).toBe(2);
  });

  it("the unconnected sender sends nothing and reports only how many", async () => {
    const counts: number[] = [];
    const push = createUnconnectedPushSender((count) => counts.push(count));
    expect(await push.send([message])).toEqual([{ status: "error", code: "NotConnected" }]);
    expect(counts).toEqual([1]);
  });
});
