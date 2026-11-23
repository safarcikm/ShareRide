import {
  listSignInMethodsRoute,
  passwordSignInRoute,
  removePasswordRoute,
  sendConfirmCodeRoute,
  setPasswordRoute,
  startEmailSignInRoute,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../../platform/passwords.ts";
import { startTestApi, type TestApi } from "../../testing.ts";

// Members' passwords (spec 27, ADR 0047): set with a fresh sign-in or a
// confirm code, the verified email as the user name, one answer for every
// wrong try, limits per email and per network address.

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

beforeEach(() => {
  api.email.sent.length = 0;
});

afterAll(async () => {
  await api.close();
});

const { memberPasswords, users } = schema;
const device = { platform: "ios", name: "Test phone", appVersion: "1.0.0" } as const;
const strong = "puffins fly north in May";

// Every wrong try runs scrypt, a quarter of a second here, so the tests of
// many tries take longer than vitest's 5 seconds.
let addresses = 0;
let networks = 0;

/** A new network address for the next requests, so tests do not share its limit. */
function newIp(): void {
  networks += 1;
  api.ip = `203.0.113.${String(networks % 250)}`;
}

type Member = Awaited<ReturnType<TestApi["signIn"]>> & { readonly email: string };

/** A member just signed in, with a verified email. */
async function member(): Promise<Member> {
  addresses += 1;
  const email = `password-${String(addresses)}@example.com`;
  const phone = api.newPhoneNumber();
  const { userId } = await api.signIn(phone);
  await api.connection.db
    .update(users)
    .set({ email, emailVerifiedAt: api.now() })
    .where(eq(users.id, userId));
  // Signed in again with the email: a fresh session.
  return { ...(await api.signIn(phone)), email };
}

function setPassword(who: Member, password: string, code?: string) {
  return api.client.call(setPasswordRoute, {
    accessToken: who.accessToken,
    body: code === undefined ? { password } : { password, code },
  });
}

function signIn(email: string, password: string) {
  return api.client.call(passwordSignInRoute, { body: { email, password, device } });
}

/** A confirm code, emailed to the member's verified email. */
async function confirmCode(who: Member): Promise<string> {
  api.advance(31);
  const sent = await api.client.call(sendConfirmCodeRoute, {
    accessToken: who.accessToken,
    body: {},
  });
  if (!sent.ok) throw new Error(sent.error.code);
  return api.lastEmailCode(who.email);
}

describe("setting a password (spec 27, 3.5)", () => {
  it("sets one within 10 minutes of signing in, then signs in with it", async () => {
    const anna = await member();
    expect(await setPassword(anna, strong)).toMatchObject({
      ok: true,
      status: 200,
      data: { setAt: api.now().toISOString() },
    });
    newIp();
    const signedIn = await signIn(anna.email, strong);
    expect(signedIn).toMatchObject({
      ok: true,
      status: 200,
      data: { status: "signedIn", isNewUser: false, user: { id: anna.userId } },
    });
  });

  it("asks for a confirm code once the sign-in is 10 minutes old, and takes it", async () => {
    const bjorn = await member();
    api.advance(10 * 60);
    expect(await setPassword(bjorn, strong)).toMatchObject({
      ok: false,
      status: 403,
      error: { code: "confirm_required" },
    });
    const code = await confirmCode(bjorn);
    const wrong = code === "000000" ? "111111" : "000000";
    expect(await setPassword(bjorn, strong, wrong)).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "code_invalid" },
    });
    expect(await setPassword(bjorn, strong, code)).toMatchObject({ ok: true });
    expect(await setPassword(bjorn, `${strong}!`, code)).toMatchObject({
      ok: false,
      error: { code: "code_expired" },
    });
  });

  it("refuses a password against the rules, with the reason (R27.2)", async () => {
    const cecilia = await member();
    const refused = async (password: string) => {
      const answer = await setPassword(cecilia, password);
      return answer.ok ? null : answer.error.code;
    };
    expect(await refused("a".repeat(9))).toBe("password_too_short");
    expect(await refused("a".repeat(129))).toBe("password_too_long");
    expect(await refused("QwertyUiop")).toBe("password_too_common");
    expect(await refused(cecilia.email.toUpperCase())).toBe("password_is_email");
    expect(
      await api.connection.db
        .select()
        .from(memberPasswords)
        .where(eq(memberPasswords.userId, cecilia.userId)),
    ).toEqual([]);
  });

  it("needs a verified email, which is the user name", async () => {
    const phone = api.newPhoneNumber();
    const withoutEmail = { ...(await api.signIn(phone)), email: "" };
    expect(await setPassword(withoutEmail, strong)).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "email_required" },
    });
  });

  it("stores only a scrypt hash with its settings", async () => {
    const dora = await member();
    await setPassword(dora, strong);
    const [row] = await api.connection.db
      .select({ hash: memberPasswords.hash })
      .from(memberPasswords)
      .where(eq(memberPasswords.userId, dora.userId));
    expect(row?.hash).toMatch(/^scrypt\$15\$8\$3\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
    expect(row?.hash).not.toContain("puffins");
  });

  it("tells the verified email when a password is added, changed or removed (R27.7)", async () => {
    const egill = await member();
    await setPassword(egill, strong);
    await setPassword(egill, `${strong} and June`);
    expect(
      await api.client.call(removePasswordRoute, { accessToken: egill.accessToken }),
    ).toMatchObject({ ok: true, status: 204 });
    expect(api.email.sent.map((email) => [email.to, email.subject])).toEqual([
      [egill.email, "A password was added to your PuffinRide account"],
      [egill.email, "Your PuffinRide password was changed"],
      [egill.email, "The password was removed from your PuffinRide account"],
    ]);
  });

  it("saves at most 10 passwords an hour for an account, each hashed and emailed (R27.4)", async () => {
    const elin = await member();
    for (let i = 0; i < 10; i++) {
      expect(await setPassword(elin, `${strong} number ${String(i)}`)).toMatchObject({
        ok: true,
      });
    }
    const refused = await setPassword(elin, `${strong} once more`);
    expect(refused).toMatchObject({ ok: false, status: 429, error: { code: "rate_limited" } });
    expect(refused.ok ? 0 : (refused.error.retryAfterSeconds ?? 0)).toBeGreaterThan(3500);
    expect(api.email.sent).toHaveLength(10);
    api.advance(3600);
    newIp();
    const again = await signIn(elin.email, `${strong} number 9`);
    if (!again.ok) throw new Error(again.error.code);
    expect(
      await setPassword({ ...elin, accessToken: again.data.accessToken }, `${strong} later on`),
    ).toMatchObject({ ok: true });
  }, 60_000);

  it("lists the password in Sign-in methods, and removes it", async () => {
    const freyja = await member();
    const methods = () =>
      api.client.call(listSignInMethodsRoute, { accessToken: freyja.accessToken });
    expect(await methods()).toMatchObject({ ok: true, data: { password: null } });
    await setPassword(freyja, strong);
    expect(await methods()).toMatchObject({
      ok: true,
      data: { password: { setAt: api.now().toISOString() } },
    });
    await api.client.call(removePasswordRoute, { accessToken: freyja.accessToken });
    expect(await methods()).toMatchObject({ ok: true, data: { password: null } });
    expect(
      await api.client.call(removePasswordRoute, { accessToken: freyja.accessToken }),
    ).toMatchObject({ ok: false, status: 404, error: { code: "not_found" } });
    newIp();
    expect(await signIn(freyja.email, strong)).toMatchObject({
      ok: false,
      error: { code: "credentials_invalid" },
    });
  });
});

describe("signing in with a password (spec 27, 3.2)", () => {
  it("gives one answer for a wrong password, an unknown email and no password (R27.4)", async () => {
    const gunnar = await member();
    await setPassword(gunnar, strong);
    const withoutPassword = await member();
    newIp();
    const answers = await Promise.all([
      signIn(gunnar.email, "not the password at all"),
      signIn("nobody-has-this@example.com", strong),
      signIn(withoutPassword.email, strong),
      signIn("not an address", strong),
    ]);
    for (const answer of answers) {
      expect(answer).toMatchObject({
        ok: false,
        status: 400,
        error: { code: "credentials_invalid", message: "Wrong email or password." },
      });
    }
  });

  it("takes the email in any case, and a password typed in another Unicode form", async () => {
    const helga = await member();
    await setPassword(helga, "kaffi og káka hjá ömmu");
    newIp();
    expect(await signIn(helga.email.toUpperCase(), "kaffi og káka hjá ömmu")).toMatchObject({
      ok: true,
    });
  });

  it("allows 10 wrong tries an hour for one email, then waits, while the email code works", async () => {
    const ingi = await member();
    await setPassword(ingi, strong);
    newIp();
    for (let i = 0; i < 10; i++) {
      expect(await signIn(ingi.email, `wrong guess number ${String(i)}`)).toMatchObject({
        status: 400,
      });
    }
    newIp();
    const refused = await signIn(ingi.email, strong);
    expect(refused).toMatchObject({ ok: false, status: 429, error: { code: "rate_limited" } });
    expect(refused.ok ? 0 : (refused.error.retryAfterSeconds ?? 0)).toBeGreaterThan(3500);
    api.advance(31);
    expect(
      await api.client.call(startEmailSignInRoute, { body: { email: ingi.email, locale: "en" } }),
    ).toMatchObject({ ok: true, status: 202 });
    api.advance(3600);
    expect(await signIn(ingi.email, strong)).toMatchObject({ ok: true });
  }, 60_000);

  it("allows 30 wrong tries an hour from one network address", async () => {
    newIp();
    for (let i = 0; i < 30; i++) {
      expect(await signIn(`guess-${String(i)}@example.com`, strong)).toMatchObject({
        status: 400,
      });
    }
    expect(await signIn("guess-last@example.com", strong)).toMatchObject({
      status: 429,
      error: { code: "rate_limited" },
    });
  }, 60_000);

  it("counts wrong tries made at once within the limit", async () => {
    const jona = await member();
    await setPassword(jona, strong);
    newIp();
    const answers = await Promise.all(
      Array.from({ length: 12 }, (_, i) => signIn(jona.email, `wrong at once ${String(i)}`)),
    );
    const statuses = answers.map((answer) => answer.status).sort();
    expect(statuses).toEqual([...Array<number>(10).fill(400), 429, 429]);
    newIp();
    expect(await signIn(jona.email, strong)).toMatchObject({ status: 429 });
  }, 60_000);

  it("takes a right password back from the wrong tries, but counts every try, 20 an hour", async () => {
    const oskar = await member();
    await setPassword(oskar, strong);
    newIp();
    // More than the 10 wrong tries allowed: none of them was wrong. (Tries
    // at the same moment each count as wrong until checked.)
    for (let i = 0; i < 11; i++) {
      expect(await signIn(oskar.email, strong)).toMatchObject({ ok: true });
    }
    expect(await signIn(oskar.email, "one wrong guess")).toMatchObject({ status: 400 });
    for (let i = 0; i < 8; i++) {
      expect(await signIn(oskar.email, strong)).toMatchObject({ ok: true });
    }
    newIp();
    expect(await signIn(oskar.email, strong)).toMatchObject({
      status: 429,
      error: { code: "rate_limited" },
    });
    expect(api.logLines.join("")).toContain('"scope":"password_try_email"');
  }, 60_000);

  it("makes a hash with older settings again at sign-in, and keeps when it was chosen", async () => {
    const kari = await member();
    const setAt = new Date("2026-11-01T12:00:00.000Z");
    await api.connection.db.insert(memberPasswords).values({
      userId: kari.userId,
      hash: await hashPassword(strong, { logN: 14, r: 8, p: 1 }),
      setAt,
    });
    newIp();
    expect(await signIn(kari.email, strong)).toMatchObject({ ok: true });
    const [row] = await api.connection.db
      .select({ hash: memberPasswords.hash, setAt: memberPasswords.setAt })
      .from(memberPasswords)
      .where(eq(memberPasswords.userId, kari.userId));
    expect(row?.hash.startsWith("scrypt$15$8$3$")).toBe(true);
    expect(row?.setAt).toEqual(setAt);
    expect(
      await api.client.call(listSignInMethodsRoute, { accessToken: kari.accessToken }),
    ).toMatchObject({ ok: true, data: { password: { setAt: setAt.toISOString() } } });
  });

  it("says an account cannot sign in only after the right password", async () => {
    const lilja = await member();
    await setPassword(lilja, strong);
    await api.connection.db
      .update(users)
      .set({ status: "deleted" })
      .where(eq(users.id, lilja.userId));
    newIp();
    expect(await signIn(lilja.email, "a wrong password here")).toMatchObject({
      status: 400,
      error: { code: "credentials_invalid" },
    });
    expect(await signIn(lilja.email, strong)).toMatchObject({
      status: 403,
      error: { code: "account_unavailable" },
    });
  });

  it("signs in an account waiting to be deleted, which can then keep it", async () => {
    const mia = await member();
    await setPassword(mia, strong);
    const deleteAfter = new Date(api.now().getTime() + 30 * 24 * 3600 * 1000);
    await api.connection.db.update(users).set({ deleteAfter }).where(eq(users.id, mia.userId));
    newIp();
    expect(await signIn(mia.email, strong)).toMatchObject({
      ok: true,
      status: 200,
      data: { user: { deletionScheduledFor: deleteAfter.toISOString() } },
    });
  });

  it("keeps the refresh token in a cookie on the web", async () => {
    const magnus = await member();
    await setPassword(magnus, strong);
    newIp();
    const response = await api.request("/v1/auth/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: magnus.email,
        password: strong,
        device: { platform: "web" },
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.refreshToken).toBeUndefined();
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/i);
  });

  it("logs no email and no password", async () => {
    const nanna = await member();
    await setPassword(nanna, strong);
    newIp();
    await signIn(nanna.email, strong);
    await signIn(nanna.email, "another wrong one");
    const logs = api.logLines.join("");
    expect(logs).toContain("wrong password");
    expect(logs).not.toContain(nanna.email);
    expect(logs).not.toContain("puffins fly");
    expect(logs).not.toContain("another wrong");
  });
});
