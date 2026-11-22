import { describe, expect, it } from "vitest";
import { EmailMaybeSent, type EmailMessage } from "./email.ts";
import { createMailjetEmailSender } from "./email-mailjet.ts";

const message: EmailMessage = {
  to: "anna@example.com",
  subject: "Pay now: BSÍ – N1 Borgarnes",
  text: "Pay 2,500 ISK by 20:46 to confirm your seat.",
  html: "<p>Pay 2,500 ISK by 20:46 to confirm your seat.</p>",
  idempotencyKey: "0190a1d6-0000-7000-8000-0000000000d1",
};

const keys = { apiKey: "public-key", secretKey: "secret-key" };
const from = { email: "hello@shareride.example", name: "PuffinRide" };

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

/** A stand-in for fetch that records each request and answers as told. */
function fakeFetch(answer: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    return answer();
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

/** Mailjet's answer to one message it took. */
const accepted = () =>
  Response.json({
    Messages: [
      {
        Status: "success",
        To: [
          {
            Email: message.to,
            MessageUUID: "1ab23cd4-e567-8901-f234-567890abcdef",
            MessageID: 456,
            MessageHref: "https://api.mailjet.com/v3/REST/message/456",
          },
        ],
      },
    ],
  });

/** The JSON a request sent, as text. */
const bodyOf = (call: Call | undefined) =>
  typeof call?.init.body === "string" ? call.init.body : "null";

async function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("expected it to fail");
    },
    (caught: unknown) => caught,
  );
}

const neverLeft = () =>
  Object.assign(new TypeError("fetch failed"), {
    cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
  });

describe("createMailjetEmailSender (ADR 0027)", () => {
  it("posts one message to Mailjet's Send API with tracking off, and gives its ID", async () => {
    const { calls, fetch } = fakeFetch(accepted);
    const sent = await createMailjetEmailSender({ ...keys, from, fetch }).send(message);

    expect(sent).toEqual({ id: "1ab23cd4-e567-8901-f234-567890abcdef" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.mailjet.com/v3.1/send");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.headers).toMatchObject({
      authorization: `Basic ${Buffer.from("public-key:secret-key").toString("base64")}`,
      "content-type": "application/json",
    });
    expect(JSON.parse(bodyOf(calls[0]))).toEqual({
      Messages: [
        {
          From: { Email: "hello@shareride.example", Name: "PuffinRide" },
          To: [{ Email: "anna@example.com" }],
          Subject: message.subject,
          TextPart: message.text,
          HTMLPart: message.html,
          CustomID: message.idempotencyKey,
          TrackOpens: "disabled",
          TrackClicks: "disabled",
        },
      ],
    });
  });

  it("sends the pictures the HTML shows inside the email, as inline attachments (spec 24, 3.4)", async () => {
    const { calls, fetch } = fakeFetch(accepted);
    const content = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    await createMailjetEmailSender({ ...keys, from, fetch }).send({
      ...message,
      html: '<img src="cid:puffinride-logo" alt="">',
      images: [
        {
          contentId: "puffinride-logo",
          filename: "puffinride.png",
          contentType: "image/png",
          content,
        },
      ],
    });

    const [sent] = (JSON.parse(bodyOf(calls[0])) as { Messages: unknown[] }).Messages;
    expect(sent).toMatchObject({
      InlinedAttachments: [
        {
          ContentType: "image/png",
          Filename: "puffinride.png",
          ContentID: "puffinride-logo",
          Base64Content: Buffer.from(content).toString("base64"),
        },
      ],
    });
  });

  it("sends no attachments field when there are no pictures", async () => {
    const { calls, fetch } = fakeFetch(accepted);
    await createMailjetEmailSender({ ...keys, from, fetch }).send({ ...message, images: [] });

    expect(bodyOf(calls[0])).not.toContain("InlinedAttachments");
  });

  it("asks Mailjet not to send in sandbox mode", async () => {
    const { calls, fetch } = fakeFetch(() =>
      Response.json({
        Messages: [
          { Status: "success", To: [{ Email: message.to, MessageUUID: "", MessageID: 0 }] },
        ],
      }),
    );
    const sent = await createMailjetEmailSender({ ...keys, from, fetch, sandbox: true }).send(
      message,
    );
    expect(sent).toEqual({ id: "" });
    expect(JSON.parse(bodyOf(calls[0]))).toMatchObject({ SandboxMode: true });
  });

  it("fails a message Mailjet refuses, naming its error codes, never the address or the text", async () => {
    const { fetch } = fakeFetch(() =>
      Response.json(
        {
          Messages: [
            {
              Status: "error",
              Errors: [
                {
                  ErrorIdentifier: "f987008f-251a-4dff-8ffc-40f1583ad7bc",
                  ErrorCode: "mj-0013",
                  StatusCode: 400,
                  ErrorMessage: '"anna@example.com" is an invalid email address.',
                  ErrorRelatedTo: ["To[0].Email"],
                },
              ],
            },
          ],
        },
        { status: 400 },
      ),
    );
    const error = await failure(createMailjetEmailSender({ ...keys, from, fetch }).send(message));
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(EmailMaybeSent);
    expect(String(error)).toContain("mj-0013");
    expect(String(error)).toContain("400");
    expect(String(error)).not.toContain("anna");
    expect(String(error)).not.toContain("2,500");
  });

  it("fails a request Mailjet refuses as a whole, such as wrong keys, so it is tried again", async () => {
    const { fetch } = fakeFetch(() =>
      Response.json(
        {
          ErrorIdentifier: "x",
          ErrorCode: "mj-0015",
          ErrorMessage: "API key unknown",
          StatusCode: 401,
        },
        { status: 401 },
      ),
    );
    const error = await failure(createMailjetEmailSender({ ...keys, from, fetch }).send(message));
    expect(error).not.toBeInstanceOf(EmailMaybeSent);
    expect(String(error)).toContain("401");
    expect(String(error)).toContain("mj-0015");
  });

  it("says the email may have gone out after a server error that can come after taking it", async () => {
    for (const status of [500, 502, 504]) {
      const { fetch } = fakeFetch(() => new Response("Bad gateway", { status }));
      const error = await failure(createMailjetEmailSender({ ...keys, from, fetch }).send(message));
      expect(error).toBeInstanceOf(EmailMaybeSent);
      expect(String(error)).toContain(String(status));
    }
    for (const status of [429, 503]) {
      const { fetch } = fakeFetch(() => new Response("Busy", { status }));
      const error = await failure(createMailjetEmailSender({ ...keys, from, fetch }).send(message));
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(EmailMaybeSent);
    }
  });

  it("fails a request that never left, so it is tried again", async () => {
    const { fetch } = fakeFetch(() => Promise.reject(neverLeft()));
    const error = await failure(createMailjetEmailSender({ ...keys, from, fetch }).send(message));
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(EmailMaybeSent);
  });

  it("says the email may have gone out when the answer is lost or out of shape", async () => {
    const timedOut = fakeFetch(() =>
      Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
    );
    expect(
      await failure(
        createMailjetEmailSender({ ...keys, from, fetch: timedOut.fetch }).send(message),
      ),
    ).toBeInstanceOf(EmailMaybeSent);

    const odd = fakeFetch(() => Response.json({ Messages: [] }));
    expect(
      await failure(createMailjetEmailSender({ ...keys, from, fetch: odd.fetch }).send(message)),
    ).toBeInstanceOf(EmailMaybeSent);

    const notJson = fakeFetch(() => new Response("<html>Bad gateway</html>", { status: 200 }));
    expect(
      await failure(
        createMailjetEmailSender({ ...keys, from, fetch: notJson.fetch }).send(message),
      ),
    ).toBeInstanceOf(EmailMaybeSent);
  });
});
