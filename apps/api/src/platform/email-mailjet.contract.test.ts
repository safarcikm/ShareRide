// Checks the Mailjet adapter against the real API in sandbox mode, where
// Mailjet checks the message and sends nothing: our keys and sender are
// accepted, tracking off is a valid setting, and the answer reads as the
// adapter expects. Then a wrong secret is refused. `pnpm --filter
// @shareride/api test:contract` with MAILJET_API_KEY, MAILJET_SECRET_KEY
// and EMAIL_FROM set. Not part of the CI run.
import { describe, expect, it } from "vitest";
import { EmailMaybeSent } from "./email.ts";
import { createMailjetEmailSender } from "./email-mailjet.ts";

const apiKey = process.env["MAILJET_API_KEY"];
const secretKey = process.env["MAILJET_SECRET_KEY"];
const fromEmail = process.env["EMAIL_FROM"];

const message = {
  to: "contract-test@example.com",
  subject: "ShareRide contract test",
  text: "Sandbox mode: this is never sent.",
  html: "<p>Sandbox mode: this is never sent.</p>",
  idempotencyKey: "contract-test",
};

describe.skipIf(apiKey === undefined || secretKey === undefined || fromEmail === undefined)(
  "Mailjet contract (sandbox mode, nothing sent)",
  () => {
    it("accepts a message with tracking off from our sender", async () => {
      if (apiKey === undefined || secretKey === undefined || fromEmail === undefined) return;
      const sender = createMailjetEmailSender({
        apiKey,
        secretKey,
        from: { email: fromEmail, name: "ShareRide" },
        sandbox: true,
      });
      await expect(sender.send(message)).resolves.toEqual({ id: expect.any(String) as unknown });
    });

    it("refuses a wrong secret, so the worker tries again", async () => {
      if (apiKey === undefined || fromEmail === undefined) return;
      const sender = createMailjetEmailSender({
        apiKey,
        secretKey: "wrong-secret-for-the-contract-test",
        from: { email: fromEmail, name: "ShareRide" },
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
