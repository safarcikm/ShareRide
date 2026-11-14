// Checks the Vonage adapter against the real API without sending anything:
// with the account's key and a wrong secret, Vonage must refuse the
// credentials. That shows the EU endpoint answers, reads the basic auth
// header (an ignored header would be "missing parameters") and gives an
// answer the adapter reads. `pnpm --filter @shareride/api test:contract`
// with VONAGE_API_KEY set. Not part of the CI run.
import { describe, expect, it } from "vitest";
import { createVonageSmsSender } from "./sms-vonage.ts";
import { SmsSendError } from "./sms.ts";

const apiKey = process.env["VONAGE_API_KEY"];

describe.skipIf(apiKey === undefined)("Vonage contract (wrong secret, nothing sent)", () => {
  it("refuses a wrong secret as invalid credentials", async () => {
    if (apiKey === undefined) return;
    const sender = createVonageSmsSender({
      apiKey,
      apiSecret: "wrong-secret-for-the-contract-test",
      sender: "ShareRide",
    });
    const error = await sender.send({ to: "+3546900000", text: "test" }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(SmsSendError);
    expect(String(error)).toMatch(/status 4\b|HTTP 401/);
  });
});
