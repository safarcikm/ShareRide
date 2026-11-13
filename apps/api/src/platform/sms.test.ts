import { describe, expect, it } from "vitest";
import { createDevSmsSender, createPausedSmsSender, SmsSendError } from "./sms.ts";

describe("createDevSmsSender", () => {
  it("keeps sent messages for tests, newest last", async () => {
    const sms = createDevSmsSender({ print: () => undefined });
    await sms.send({ to: "+3546900001", text: "first" });
    await sms.send({ to: "+3546900002", text: "second" });
    expect(sms.outbox).toEqual([
      { to: "+3546900001", text: "first" },
      { to: "+3546900002", text: "second" },
    ]);
  });

  it("keeps only the last 50", async () => {
    const sms = createDevSmsSender({ print: () => undefined });
    for (let i = 0; i < 60; i++) await sms.send({ to: "+3546900001", text: String(i) });
    expect(sms.outbox).toHaveLength(50);
    expect(sms.outbox[0]?.text).toBe("10");
  });

  it("prints the message with the number partly hidden", async () => {
    const printed: string[] = [];
    const sms = createDevSmsSender({ print: (line) => printed.push(line) });
    await sms.send({ to: "+3546901234", text: "123456 is your code." });
    expect(printed).toEqual(["[dev SMS to +354•••••34] 123456 is your code."]);
  });
});

describe("createPausedSmsSender", () => {
  it("refuses every message, so sign-in shows that the SMS was not sent", async () => {
    await expect(createPausedSmsSender().send({ to: "+3546900001", text: "x" })).rejects.toThrow(
      SmsSendError,
    );
  });
});
