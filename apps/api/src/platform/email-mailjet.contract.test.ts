// Checks the Mailjet adapter against the real API in sandbox mode, where
// Mailjet checks the message and sends nothing: our keys and sender are
// accepted, tracking off is a valid setting, and the answer reads as the
// adapter expects. Then a wrong secret is refused. `pnpm --filter
// @shareride/api test:contract` with MAILJET_API_KEY, MAILJET_SECRET_KEY
// and EMAIL_FROM set. Not part of the CI run.
import { describe, expect, it } from "vitest";
import { emailLogo } from "../modules/notifications/email-logo.ts";
import { EmailMaybeSent } from "./email.ts";
import { createMailjetEmailSender } from "./email-mailjet.ts";

const apiKey = process.env["MAILJET_API_KEY"];
const secretKey = process.env["MAILJET_SECRET_KEY"];
const fromEmail = process.env["EMAIL_FROM"];

const message = {
  to: "contract-test@example.com",
  subject: "PuffinRide contract test",
  text: "Sandbox mode: this is never sent.",
  html: '<p><img src="cid:puffinride-logo" alt=""> Sandbox mode: this is never sent.</p>',
  // The picture inside every email (spec 24, 3.4), so Mailjet checks the attachment too.
  images: [emailLogo],
  idempotencyKey: "contract-test",
};

describe.skipIf(apiKey === undefined || secretKey === undefined || fromEmail === undefined)(
  "Mailjet contract (sandbox mode, nothing sent)",
  () => {
    it("accepts a message with tracking off and its picture inside, from our sender", async () => {
      if (apiKey === undefined || secretKey === undefined || fromEmail === undefined) return;
      const sender = createMailjetEmailSender({
        apiKey,
        secretKey,
        from: { email: fromEmail, name: "PuffinRide" },
        sandbox: true,
      });
      await expect(sender.send(message)).resolves.toEqual({ id: expect.any(String) as unknown });
    });

    it("refuses a wrong secret, so the worker tries again", async () => {
      if (apiKey === undefined || fromEmail === undefined) return;
      const sender = createMailjetEmailSender({
        apiKey,
        secretKey: "wrong-secret-for-the-contract-test",
        from: { email: fromEmail, name: "PuffinRide" },
        sandbox: true,
      });
      const error = await sender.send(message).then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(EmailMaybeSent);
      expect(String(error)).toContain("HTTP 401");
    });
  },
);
