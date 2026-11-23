import { createApiClient } from "@shareride/api-client";
import {
  getMeRoute,
  putEmailRoute,
  sendConfirmCodeRoute,
  updateMeRoute,
  verifyEmailRoute,
} from "@shareride/contracts";
import { pingDatabase, schema } from "@shareride/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.ts";
import { createLogger } from "../../logger.ts";
import { EmailMaybeSent } from "../../platform/email.ts";
import { startTestApi, testWebAppUrl, type TestApi } from "../../testing.ts";

// Adding an email (spec 1, 3.5; plan 4.6): a link to the address, valid for
// 24 hours, makes it the account's once opened, signed in or not.

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

beforeEach(() => {
  api.email.sent.length = 0;
  api.email.failure = null;
});

afterAll(async () => {
  await api.close();
});

type Member = Awaited<ReturnType<TestApi["signIn"]>>;

const member = () => api.signIn(api.newPhoneNumber());

function putEmail(who: Member, email: string) {
  return api.client.call(putEmailRoute, { accessToken: who.accessToken, body: { email } });
}

/** A confirm code for the member, sent 31 seconds later (spec 26, R26.5). */
async function confirmCode(who: Member, phone: string): Promise<string> {
  api.advance(31);
  const sent = await api.client.call(sendConfirmCodeRoute, {
    accessToken: who.accessToken,
    body: {},
  });
  if (!sent.ok) throw new Error(sent.error.code);
  return api.lastCode(phone);
}

function putEmailWithCode(who: Member, email: string, code: string) {
  return api.client.call(putEmailRoute, { accessToken: who.accessToken, body: { email, code } });
}

async function me(who: Member) {
  const result = await api.client.call(getMeRoute, { accessToken: who.accessToken });
  if (!result.ok) throw new Error(result.error.code);
  return result.data;
}

/** The token in the last email's link. */
function lastToken(): string {
  const text = api.email.sent.at(-1)?.text ?? "";
  const token = new RegExp(`${testWebAppUrl}/verify-email#(\\S+)`).exec(text)?.[1];
  if (token === undefined) throw new Error("No link was sent.");
  return token;
}

const open = (token: string) => api.client.call(verifyEmailRoute, { body: { token } });

/** Asks for a link and opens it, a minute after the last one. */
async function verified(who: Member, email: string) {
  api.advance(61);
  const asked = await putEmail(who, email);
  if (!asked.ok) throw new Error(asked.error.code);
  const opened = await open(lastToken());
  if (!opened.ok) throw new Error(opened.error.code);
}

describe("adding an email (plan 4.6)", () => {
  it("sends a link to the address, which becomes the account's once opened, signed in or not", async () => {
    const gunna = await member();
    const asked = await putEmail(gunna, "  Gunna.Add@Example.com ");
    expect(asked).toMatchObject({
      ok: true,
      data: { email: null, pendingEmail: "gunna.add@example.com" },
    });
    expect(api.email.sent).toHaveLength(1);
    const [sent] = api.email.sent;
    expect(sent?.to).toBe("gunna.add@example.com");
    expect(sent?.subject).toBe("Confirm your email for PuffinRide");
    expect(sent?.text).toMatch(
      /^Confirm your email for PuffinRide\n\nOpen the link within 24 hours to confirm that this is your email address\. /,
    );
    expect(sent?.text).toContain(`Confirm my email: ${testWebAppUrl}/verify-email#sr_ev_`);
    expect(sent?.html).toContain(`href="${testWebAppUrl}/verify-email#sr_ev_`);
    expect(sent?.text).toContain("If that was not you, ignore it: the address is not added.");

    // Opened in a browser where nobody is signed in.
    expect(await open(lastToken())).toEqual({
      ok: true,
      status: 200,
      data: { email: "gunna.add@example.com" },
    });
    expect(await me(gunna)).toMatchObject({ email: "gunna.add@example.com", pendingEmail: null });
    const [user] = await api.connection.db
      .select({ emailVerifiedAt: schema.users.emailVerifiedAt })
      .from(schema.users)
      .where(eq(schema.users.id, gunna.userId));
    expect(user?.emailVerifiedAt).toEqual(api.now());
  });

  it("stores the link's token only as a hash", async () => {
    const bjorn = await member();
    await putEmail(bjorn, "bjorn-hash@example.com");
    const token = lastToken();
    const rows = await api.connection.db
      .select()
      .from(schema.emailVerifications)
      .where(eq(schema.emailVerifications.userId, bjorn.userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).not.toBe(token);
    expect(JSON.stringify(rows)).not.toContain(token.slice("sr_ev_".length));
  });

  it("writes in the account's language", async () => {
    const jon = await member();
    await api.client.call(updateMeRoute, { accessToken: jon.accessToken, body: { locale: "is" } });
    await putEmail(jon, "jon-is@example.com");
    expect(api.email.sent[0]?.subject).toBe("Staðfestu netfangið þitt hjá PuffinRide");
  });

  it("makes a link work once, for 24 hours, and only the newest", async () => {
    const phone = api.newPhoneNumber();
    let anna = await api.signIn(phone);
    await putEmail(anna, "anna-old@example.com");
    const first = lastToken();
    api.advance(61);
    await putEmail(anna, "anna-new@example.com");
    const second = lastToken();
    expect(await open(first)).toMatchObject({ ok: false, error: { code: "link_invalid" } });
    expect(await me(anna)).toMatchObject({ email: null, pendingEmail: "anna-new@example.com" });

    api.advance(24 * 3600);
    expect(await open(second)).toMatchObject({ ok: false, error: { code: "link_invalid" } });
    anna = await api.signIn(phone);
    expect(await me(anna)).toMatchObject({ email: null, pendingEmail: null });

    await putEmailWithCode(anna, "anna-new@example.com", await confirmCode(anna, phone));
    const third = lastToken();
    expect((await open(third)).ok).toBe(true);
    expect(await open(third)).toMatchObject({ ok: false, error: { code: "link_invalid" } });
    expect(await open("sr_ev_not-a-link")).toMatchObject({
      ok: false,
      error: { code: "link_invalid" },
    });
  });

  it("sends a link at most once a minute and 5 times a day", async () => {
    const dora = await member();
    expect((await putEmail(dora, "dora-limit@example.com")).ok).toBe(true);
    const again = await putEmail(dora, "dora-limit@example.com");
    expect(again).toMatchObject({
      ok: false,
      status: 429,
      error: { code: "rate_limited", retryAfterSeconds: 60 },
    });
    for (let count = 2; count <= 5; count++) {
      api.advance(60);
      expect((await putEmail(dora, "dora-limit@example.com")).ok).toBe(true);
    }
    api.advance(60);
    expect(await putEmail(dora, "dora-limit@example.com")).toMatchObject({
      ok: false,
      status: 429,
    });
    expect(api.email.sent).toHaveLength(5);
  });

  it("refuses something that is not an address, and sends nothing", async () => {
    const siggi = await member();
    expect(await putEmail(siggi, "siggi at example.com")).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "email_invalid" },
    });
    expect(api.email.sent).toEqual([]);
  });

  it("keeps the verified email until a new one is verified, and changes nothing for the same one", async () => {
    const helga = await member();
    await verified(helga, "helga-first@example.com");
    api.advance(61);
    await putEmail(helga, "helga-second@example.com");
    expect(await me(helga)).toMatchObject({
      email: "helga-first@example.com",
      pendingEmail: "helga-second@example.com",
    });
    await open(lastToken());
    expect(await me(helga)).toMatchObject({
      email: "helga-second@example.com",
      pendingEmail: null,
    });

    api.advance(61);
    api.email.sent.length = 0;
    expect(await putEmail(helga, "Helga-Second@example.com")).toMatchObject({
      ok: true,
      data: { email: "helga-second@example.com", pendingEmail: null },
    });
    expect(api.email.sent).toEqual([]);
  });

  it("gives up a change waiting for its link when the email in use is asked for", async () => {
    const olof = await member();
    await verified(olof, "olof-first@example.com");
    api.advance(61);
    await putEmail(olof, "olof-typo@example.con");
    const typo = lastToken();
    expect(await putEmail(olof, "olof-first@example.com")).toMatchObject({
      ok: true,
      data: { email: "olof-first@example.com", pendingEmail: null },
    });
    expect(await open(typo)).toMatchObject({ ok: false, error: { code: "link_invalid" } });
    expect(await me(olof)).toMatchObject({ email: "olof-first@example.com" });
  });

  it("never says that another account has an address, but its link does", async () => {
    const owner = await member();
    await verified(owner, "taken@example.com");
    const other = await member();
    expect(await putEmail(other, "taken@example.com")).toMatchObject({
      ok: true,
      data: { pendingEmail: "taken@example.com" },
    });
    expect(await open(lastToken())).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "email_taken" },
    });
    expect(await me(other)).toMatchObject({ email: null, pendingEmail: null });
    expect(await me(owner)).toMatchObject({ email: "taken@example.com" });
  });

  it("says when the email was not sent, logs it, and counts it towards the limits", async () => {
    const kari = await member();
    await putEmail(kari, "kari-first@example.com");
    const first = lastToken();
    api.advance(61);
    api.email.failure = new Error("Mailjet refused the email (HTTP 503)");
    expect(await putEmail(kari, "kari-failed@example.com")).toMatchObject({
      ok: false,
      status: 502,
      error: { code: "email_failed" },
    });
    expect(api.logLines.join("")).toContain("email link not sent");
    expect(api.logLines.join("")).not.toContain("kari-failed");
    // The link that did go out still works.
    expect(await me(kari)).toMatchObject({ pendingEmail: "kari-first@example.com" });

    api.email.failure = null;
    expect(await putEmail(kari, "kari-failed@example.com")).toMatchObject({
      ok: false,
      status: 429,
      error: { code: "rate_limited" },
    });
    expect((await open(first)).ok).toBe(true);
  });

  it("counts an email that may have gone out as sent", async () => {
    const kata = await member();
    api.email.failure = new EmailMaybeSent("Mailjet did not answer in time");
    expect(await putEmail(kata, "kata-maybe@example.com")).toMatchObject({
      ok: true,
      data: { pendingEmail: "kata-maybe@example.com" },
    });
    expect(api.logLines.join("")).toContain("email link may not have been sent");
  });

  it("sends one link when two are asked for at once", async () => {
    const egill = await member();
    const answers = await Promise.all([
      putEmail(egill, "egill-once@example.com"),
      putEmail(egill, "egill-once@example.com"),
    ]);
    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 429]);
    expect(api.email.sent).toHaveLength(1);
  });

  it("makes a link opened twice at once work once", async () => {
    const freyja = await member();
    await putEmail(freyja, "freyja-twice@example.com");
    const token = lastToken();
    const answers = await Promise.all([open(token), open(token)]);
    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 400]);
    expect(await me(freyja)).toMatchObject({ email: "freyja-twice@example.com" });
  });

  it("gives an address to one account when two open their links at once", async () => {
    const first = await member();
    const second = await member();
    await putEmail(first, "shared-race@example.com");
    const firstToken = lastToken();
    await putEmail(second, "shared-race@example.com");
    const secondToken = lastToken();
    const answers = await Promise.all([open(firstToken), open(secondToken)]);
    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);
    const owners = await api.connection.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, "shared-race@example.com"));
    expect(owners).toHaveLength(1);
  });

  it("says email is not available on a server that sends none", async () => {
    const withoutEmail = { ...api.features };
    delete withoutEmail.email;
    const app = createApp({
      logger: createLogger({ level: "silent" }),
      checkDatabase: () => pingDatabase(api.connection.pool),
      features: withoutEmail,
    });
    const client = createApiClient({
      baseUrl: "http://api.test",
      fetch: async (input, init) => app.request(input.replace("http://api.test", ""), init),
    });
    const lilja = await member();
    expect(
      await client.call(putEmailRoute, {
        accessToken: lilja.accessToken,
        body: { email: "lilja@example.com" },
      }),
    ).toMatchObject({ ok: false, status: 503, error: { code: "email_unavailable" } });
  });

  it("keeps the link's token out of the logs", async () => {
    const ari = await member();
    await putEmail(ari, "ari-logs@example.com");
    const token = lastToken();
    await open(token);
    expect(api.logLines.join("")).not.toContain(token);
    expect(api.logLines.join("")).not.toContain("ari-logs");
  });
});

describe("a new email signs in, so it needs a confirm code (spec 26, R26.5, R26.6)", () => {
  /** A member whose account was made more than 30 minutes ago, signed in again. */
  async function oldMember() {
    const phone = api.newPhoneNumber();
    await api.signIn(phone);
    api.advance(30 * 60);
    // Signed in again: an access token lasts 15 minutes.
    return { phone, who: await api.signIn(phone) };
  }

  it("needs no code within 30 minutes of the account being made", async () => {
    const phone = api.newPhoneNumber();
    await api.signIn(phone);
    api.advance(29 * 60);
    // Signed in again: an access token lasts 15 minutes.
    const newcomer = await api.signIn(phone);
    expect(await putEmail(newcomer, "new-in-time@example.com")).toMatchObject({ ok: true });
  });

  it("asks for a confirm code after that, and sends nothing without one", async () => {
    const { who } = await oldMember();
    expect(await putEmail(who, "no-code@example.com")).toMatchObject({
      ok: false,
      status: 403,
      error: { code: "confirm_required" },
    });
    expect(api.email.sent).toEqual([]);
    expect(await me(who)).toMatchObject({ pendingEmail: null });
  });

  it("sends the link with the right code, and the code works once", async () => {
    const { phone, who } = await oldMember();
    const code = await confirmCode(who, phone);
    expect(await putEmailWithCode(who, "with-code@example.com", code)).toMatchObject({
      ok: true,
      data: { pendingEmail: "with-code@example.com" },
    });
    api.advance(61);
    expect(await putEmailWithCode(who, "again@example.com", code)).toMatchObject({
      ok: false,
      error: { code: "code_expired" },
    });
  });

  it("counts a wrong code as a try and sends nothing", async () => {
    const { phone, who } = await oldMember();
    const code = await confirmCode(who, phone);
    const wrong = code === "000000" ? "111111" : "000000";
    expect(await putEmailWithCode(who, "wrong-code@example.com", wrong)).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "code_invalid", attemptsLeft: 4 },
    });
    expect(api.email.sent).toEqual([]);
  });

  it("keeps the code when the link could not be sent", async () => {
    const { phone, who } = await oldMember();
    const code = await confirmCode(who, phone);
    api.email.failure = new Error("Mailjet refused the email (HTTP 503)");
    expect(await putEmailWithCode(who, "kept-code@example.com", code)).toMatchObject({
      ok: false,
      status: 502,
      error: { code: "email_failed" },
    });
    api.email.failure = null;
    api.advance(61);
    expect(await putEmailWithCode(who, "kept-code@example.com", code)).toMatchObject({ ok: true });
  });

  it("needs no code for the account's own verified email", async () => {
    const phone = api.newPhoneNumber();
    const newcomer = await api.signIn(phone);
    await verified(newcomer, "own-email@example.com");
    api.advance(30 * 60);
    const who = await api.signIn(phone);
    expect(await putEmail(who, "own-email@example.com")).toMatchObject({
      ok: true,
      data: { email: "own-email@example.com" },
    });
  });

  it("tells the old verified address, with the new one partly hidden, and logs no address", async () => {
    const phone = api.newPhoneNumber();
    const newcomer = await api.signIn(phone);
    await verified(newcomer, "old-address@example.com");
    api.advance(30 * 60);
    const who = await api.signIn(phone);
    api.email.sent.length = 0;
    const texts = api.sms.outbox.length;
    await confirmCode(who, phone);
    // The account has a verified email, so the code came by email, not by text (R26.7).
    expect(api.sms.outbox).toHaveLength(texts);
    const code = api.lastEmailCode("old-address@example.com");
    expect(await putEmailWithCode(who, "new-address@example.com", code)).toMatchObject({
      ok: true,
    });
    expect((await open(lastToken())).ok).toBe(true);

    expect(api.email.sent.at(-1)).toMatchObject({
      to: "old-address@example.com",
      subject: "Your PuffinRide sign-in email changed",
    });
    expect(api.email.sent.at(-1)?.text).toContain("ne•••@example.com");
    expect(api.email.sent.at(-1)?.text).not.toContain("new-address");
    const logs = api.logLines.join("");
    expect(logs).toContain("email change notice sent");
    expect(logs).not.toContain("old-address");
    expect(logs).not.toContain("new-address");
  });

  it("tells no address that was never verified", async () => {
    const phone = api.newPhoneNumber();
    const newcomer = await api.signIn(phone);
    await putEmail(newcomer, "never-opened@example.com");
    await verified(newcomer, "opened@example.com");
    // Only its own link went to the address never opened: no notice.
    expect(api.email.sent.filter((sent) => sent.to === "never-opened@example.com")).toHaveLength(1);
  });
});
