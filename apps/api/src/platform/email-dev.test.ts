import { describe, expect, it } from "vitest";
import type { EmailMessage } from "./email.ts";
import { createDevEmailSender } from "./email-dev.ts";

const message = (n: number): EmailMessage => ({
  to: "anna.jons@example.com",
  subject: `Pay now ${String(n)}`,
  text: "Pay 2,500 ISK by 20:46 to confirm your seat.\n\nOpen it: http://localhost:8081/bookings/1",
  html: "<p>Pay 2,500 ISK by 20:46 to confirm your seat.</p>",
  idempotencyKey: `delivery-${String(n)}`,
});

describe("createDevEmailSender (the development outbox)", () => {
  it("keeps the last 50 emails for tests, newest last, each with an ID", async () => {
    const email = createDevEmailSender({ print: () => undefined });
    expect(await email.send(message(1))).toEqual({ id: "dev-delivery-1" });
    for (let n = 2; n <= 60; n++) await email.send(message(n));
    expect(email.outbox).toHaveLength(50);
    expect(email.outbox[0]?.subject).toBe("Pay now 11");
    expect(email.outbox.at(-1)?.subject).toBe("Pay now 60");
  });

  it("prints the subject and the text, with the address partly hidden", async () => {
    const printed: string[] = [];
    const email = createDevEmailSender({ print: (line) => printed.push(line) });
    await email.send(message(1));
    expect(printed).toEqual([
      [
        "[dev email to an•••@example.com] Pay now 1",
        "Pay 2,500 ISK by 20:46 to confirm your seat.",
        "",
        "Open it: http://localhost:8081/bookings/1",
      ].join("\n"),
    ]);
  });
});
