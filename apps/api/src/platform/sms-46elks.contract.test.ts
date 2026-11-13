// Checks the 46elks adapter against the real API with a dry run, so nothing
// is sent or charged: `pnpm --filter @shareride/api test:contract` with
// ELKS_API_USERNAME and ELKS_API_PASSWORD set. Not part of the CI run.
import { createTranslator } from "@shareride/i18n";
import { describe, expect, it } from "vitest";
import { createElksSmsSender } from "./sms-46elks.ts";
import { SmsSendError } from "./sms.ts";

const username = process.env["ELKS_API_USERNAME"];
const password = process.env["ELKS_API_PASSWORD"];
const keys = username !== undefined && password !== undefined ? { username, password } : null;
// A dry run sends nothing, so any well-formed number will do.
const to = "+3546900000";

describe.skipIf(keys === null)("46elks contract (dry run)", () => {
  const sender = (credentials: { username: string; password: string }) =>
    createElksSmsSender({ ...credentials, sender: "ShareRide", dryRun: true });

  it.each(["is", "en"] as const)("accepts a sign-in code text in %s", async (locale) => {
    if (keys === null) return;
    const text = createTranslator(locale)("sms.signInCode", { code: "123456" });
    await expect(sender(keys).send({ to, text })).resolves.toBeUndefined();
  });

  it("refuses wrong keys", async () => {
    await expect(
      sender({ username: "u-wrong", password: "p-wrong" }).send({ to, text: "test" }),
    ).rejects.toThrow(SmsSendError);
  });
});
