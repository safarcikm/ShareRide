import { describe, expect, it } from "vitest";
import { selectSmsSender } from "./select-sms-sender.ts";
import { SmsSendError } from "./sms.ts";

const message = { to: "+3546900001", text: "123456 is your ShareRide code." };

describe("selectSmsSender", () => {
  it("prints codes with the development sender", async () => {
    const printed: string[] = [];
    const sms = selectSmsSender({ provider: "dev", paused: false }, (line) => printed.push(line));
    await sms.send(message);
    expect(printed).toHaveLength(1);
  });

  it("refuses every message while paused, whatever the provider", async () => {
    const printed: string[] = [];
    const dev = selectSmsSender({ provider: "dev", paused: true }, (line) => printed.push(line));
    await expect(dev.send(message)).rejects.toThrow(SmsSendError);
    const elks = selectSmsSender(
      { provider: "46elks", username: "u", password: "p", sender: "ShareRide", paused: true },
      () => undefined,
    );
    await expect(elks.send(message)).rejects.toThrow(SmsSendError);
    const vonage = selectSmsSender(
      { provider: "vonage", apiKey: "k", apiSecret: "s", sender: "ShareRide", paused: true },
      () => undefined,
    );
    await expect(vonage.send(message)).rejects.toThrow(SmsSendError);
    expect(printed).toEqual([]);
  });

  it("sends through Vonage when configured", async () => {
    const urls: string[] = [];
    const fetch = ((url: string) => {
      urls.push(url);
      return Promise.resolve(Response.json({ "message-count": "1", messages: [{ status: "0" }] }));
    }) as typeof globalThis.fetch;
    const sms = selectSmsSender(
      { provider: "vonage", apiKey: "k", apiSecret: "s", sender: "ShareRide", paused: false },
      () => undefined,
      fetch,
    );
    await sms.send(message);
    expect(urls).toEqual(["https://api-eu.vonage.com/sms/json"]);
  });

  it("sends through 46elks when configured", async () => {
    const urls: string[] = [];
    const fetch = ((url: string) => {
      urls.push(url);
      return Promise.resolve(Response.json({ status: "created" }));
    }) as typeof globalThis.fetch;
    const sms = selectSmsSender(
      { provider: "46elks", username: "u", password: "p", sender: "ShareRide", paused: false },
      () => undefined,
      fetch,
    );
    await sms.send(message);
    expect(urls).toEqual(["https://api.46elks.com/a1/sms"]);
  });
});
