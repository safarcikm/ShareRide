import { chatMessage, messageId } from "@/testing/chat";
import { merged } from "./messages";

describe("merged", () => {
  const mine = chatMessage({ id: messageId(2), from: "me", text: "Hi" });
  const later = chatMessage({ id: messageId(3), sentAt: "2026-11-14T12:01:00.000Z" });

  it("adds new messages in order and takes the newer copy of known ones", () => {
    const seen = { ...mine, readAt: "2026-11-14T12:02:00.000Z" };
    expect(merged([mine], [later, seen])).toEqual([seen, later]);
  });

  it("keeps a message read when an older copy arrives late", () => {
    const seen = { ...mine, readAt: "2026-11-14T12:02:00.000Z" };
    expect(merged([seen], [mine])).toEqual([seen]);
  });
});
