import { describe, expect, it } from "vitest";
import { createFakePushSender, type PushMessage } from "./push.ts";

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

  it("the fake refuses the tokens it is told to, and gives the receipts it is told to", async () => {
    const push = createFakePushSender();
    push.refused.set("ExponentPushToken[gone]", "DeviceNotRegistered");
    expect(await push.send([{ ...message, to: "ExponentPushToken[gone]" }, message])).toEqual([
      { status: "error", code: "DeviceNotRegistered" },
      { status: "ok", id: "ticket-1" },
    ]);
    expect(push.sent).toEqual([message]);
    push.receiptsGiven.set("ticket-1", { status: "ok" });
    expect(await push.receipts(["ticket-1", "ticket-2"])).toEqual(
      new Map([["ticket-1", { status: "ok" }]]),
    );
    expect(push.checked).toEqual([["ticket-1", "ticket-2"]]);
  });
});
