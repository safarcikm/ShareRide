import type { legalAcceptancesBodySchema, updateMeBodySchema } from "@shareride/contracts";
import {
  acceptLegalRoute,
  currentLegalDocumentRoute,
  getMeRoute,
  updateMeRoute,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";
import { startTestApi, type TestApi } from "../../testing.ts";

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  await api.close();
});

const acceptBoth: z.input<typeof legalAcceptancesBodySchema> = {
  ageConfirmed: true,
  documents: [
    { type: "terms", version: 1 },
    { type: "community-rules", version: 1 },
  ],
  locale: "is",
};

/** Accepts the current Terms and Community Rules, as the app does. */
async function acceptCurrent(accessToken: string) {
  const documents = [];
  for (const type of ["terms", "community-rules"] as const) {
    const current = await api.client.call(currentLegalDocumentRoute, {
      params: { type },
      query: {},
    });
    if (!current.ok) throw new Error(current.error.code);
    documents.push({ type, version: current.data.version });
  }
  const result = await api.client.call(acceptLegalRoute, {
    body: { ageConfirmed: true, documents, locale: "en" },
    accessToken,
  });
  if (!result.ok) throw new Error(result.error.code);
}

function update(accessToken: string, body: z.input<typeof updateMeBodySchema>) {
  return api.client.call(updateMeRoute, { body, accessToken });
}

describe("legal documents", () => {
  it("are public, in the language asked for", async () => {
    const result = await api.client.call(currentLegalDocumentRoute, {
      params: { type: "community-rules" },
      query: { locale: "is" },
    });
    expect(result).toMatchObject({
      ok: true,
      data: { type: "community-rules", version: 1, locale: "is", title: "Samfélagsreglur" },
    });
  });

  it("are in English when no language is given", async () => {
    const result = await api.client.call(currentLegalDocumentRoute, {
      params: { type: "privacy" },
      query: {},
    });
    expect(result).toMatchObject({ data: { title: "Privacy Policy", locale: "en" } });
  });

  it("refuse an unknown type", async () => {
    const response = await api.request("/v1/legal/cookies/current");
    expect(response.status).toBe(400);
  });
});

describe("terms and age (spec 1, section 3.4)", () => {
  it("are needed before the account is complete", async () => {
    const { accessToken } = await api.signIn(api.newPhoneNumber());
    const accepted = await api.client.call(acceptLegalRoute, { body: acceptBoth, accessToken });
    expect(accepted).toMatchObject({
      ok: true,
      data: { ageConfirmed: true, missingSteps: ["profile"] },
    });
    const rows = await api.connection.db.select().from(schema.legalAcceptances);
    expect(rows.at(-1)).toMatchObject({ version: 1, locale: "is" });
  });

  it("need the age confirmation as well as the documents", async () => {
    const { accessToken } = await api.signIn(api.newPhoneNumber());
    const accepted = await api.client.call(acceptLegalRoute, {
      body: { ...acceptBoth, ageConfirmed: undefined },
      accessToken,
    });
    expect(accepted).toMatchObject({
      data: { ageConfirmed: false, missingSteps: ["legal", "profile"] },
    });
  });

  it("refuse an outdated version", async () => {
    const { accessToken } = await api.signIn(api.newPhoneNumber());
    const result = await api.client.call(acceptLegalRoute, {
      body: { ...acceptBoth, documents: [{ type: "terms", version: 2 }] },
      accessToken,
    });
    expect(result).toMatchObject({ status: 409, error: { code: "legal_version_outdated" } });
  });

  it("refuse the Privacy Policy, which is shown but not accepted", async () => {
    const { accessToken } = await api.signIn(api.newPhoneNumber());
    const response = await api.request("/v1/me/legal-acceptances", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ documents: [{ type: "privacy", version: 1 }], locale: "en" }),
    });
    expect(response.status).toBe(400);
  });

  it("are asked again after a material change, but not after a minor one", async () => {
    const { accessToken } = await api.signIn(api.newPhoneNumber());
    await api.client.call(acceptLegalRoute, { body: acceptBoth, accessToken });
    const texts = { title: "Terms", summary: "Changed.", body: "New terms." };

    await api.connection.db.insert(schema.legalDocuments).values({
      type: "terms",
      version: 2,
      material: false,
      texts: { en: texts, is: texts },
      publishedAt: api.now(),
    });
    expect(await api.client.call(getMeRoute, { accessToken })).toMatchObject({
      data: { missingSteps: ["profile"] },
    });

    await api.connection.db.insert(schema.legalDocuments).values({
      type: "terms",
      version: 3,
      material: true,
      texts: { en: texts, is: texts },
      publishedAt: api.now(),
    });
    expect(await api.client.call(getMeRoute, { accessToken })).toMatchObject({
      data: { missingSteps: ["legal", "profile"] },
    });

    const accepted = await api.client.call(acceptLegalRoute, {
      body: { documents: [{ type: "terms", version: 3 }], locale: "en" },
      accessToken,
    });
    expect(accepted).toMatchObject({ data: { missingSteps: ["profile"] } });
  });
});

describe("profile (spec 1, section 3.5)", () => {
  it("completes the account with a first name, about and languages", async () => {
    const { accessToken } = await api.signIn(api.newPhoneNumber());
    await acceptCurrent(accessToken);
    const result = await update(accessToken, {
      firstName: "  Guðrún Ósk ",
      about: "Morgunhress.",
      languages: ["is", "en", "pl"],
      locale: "en",
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        firstName: "Guðrún Ósk",
        about: "Morgunhress.",
        languages: ["is", "en", "pl"],
        locale: "en",
        missingSteps: [],
      },
    });
  });

  it("allows a first name of 1 to 30 letters", async () => {
    const { accessToken } = await api.signIn(api.newPhoneNumber());
    expect((await update(accessToken, { firstName: "Ó" })).ok).toBe(true);
    expect((await update(accessToken, { firstName: "A".repeat(30) })).ok).toBe(true);
    for (const firstName of ["", "A".repeat(31), "R2D2", "Anna  María"]) {
      expect(await update(accessToken, { firstName })).toMatchObject({
        status: 400,
        error: { code: "profile_invalid", details: [{ path: "firstName", issue: "invalid" }] },
      });
    }
  });

  it("allows about of up to 300 characters, and clears it when empty", async () => {
    const { accessToken } = await api.signIn(api.newPhoneNumber());
    expect((await update(accessToken, { about: "x".repeat(300) })).ok).toBe(true);
    expect(await update(accessToken, { about: "x".repeat(301) })).toMatchObject({
      error: { code: "profile_invalid", details: [{ path: "about" }] },
    });
    expect(await update(accessToken, { about: "  " })).toMatchObject({ data: { about: null } });
  });

  it("allows only listed languages, once each", async () => {
    const { accessToken } = await api.signIn(api.newPhoneNumber());
    expect(await update(accessToken, { languages: ["is", "is"] })).toMatchObject({
      error: { details: [{ path: "languages" }] },
    });
    expect(await update(accessToken, { languages: ["klingon"] })).toMatchObject({
      error: { details: [{ path: "languages" }] },
    });
  });

  it("does not echo what was sent in validation errors", async () => {
    const { accessToken } = await api.signIn(api.newPhoneNumber());
    const response = await api.request("/v1/me", {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ firstName: "Secret-Name-123", locale: "de" }),
    });
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("Secret-Name-123");
  });
});
