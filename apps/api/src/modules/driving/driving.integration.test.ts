import {
  addVehicleRoute,
  declareLicenceRoute,
  driverReadinessRoute,
  listVehiclesRoute,
  removeVehicleRoute,
  updateVehicleRoute,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  await api.close();
});

const yaris = { make: "Toyota", model: "Yaris", colour: "white", registration: null };

/** A new driver with a finished account: terms accepted and a first name. */
async function newDriver() {
  const signedIn = await api.signIn(api.newPhoneNumber());
  await api.connection.db
    .update(schema.users)
    .set({ firstName: "Anna", ageConfirmedAt: api.now() })
    .where(eq(schema.users.id, signedIn.userId));
  const documents = await api.connection.db.select().from(schema.legalDocuments);
  await api.connection.db.insert(schema.legalAcceptances).values(
    documents.map((document) => ({
      userId: signedIn.userId,
      documentId: document.id,
      version: document.version,
      locale: "en",
      acceptedAt: api.now(),
    })),
  );
  return signedIn;
}

describe("GET /v1/me/driver-readiness (spec 3, 3.1)", () => {
  it("lists the photo, a car and the licence for a new driver", async () => {
    const { accessToken } = await newDriver();
    const result = await api.client.call(driverReadinessRoute, { accessToken });
    expect(result).toMatchObject({
      status: 200,
      data: {
        ready: false,
        items: [
          { item: "photo", done: false, blocking: false },
          { item: "car", done: false, blocking: true },
          { item: "licence", done: false, blocking: true },
        ],
        licenceDeclaredAt: null,
      },
    });
  });

  it("is ready with a car and the licence declaration, without a photo yet", async () => {
    const { accessToken } = await newDriver();
    await api.client.call(addVehicleRoute, { accessToken, body: yaris });
    const declared = await api.client.call(declareLicenceRoute, {
      accessToken,
      body: { declared: true },
    });
    expect(declared).toMatchObject({
      status: 200,
      data: { ready: true, licenceDeclaredAt: api.now().toISOString() },
    });
  });

  it("is not ready while the account misses a step", async () => {
    const { accessToken } = await api.signIn(api.newPhoneNumber());
    await api.client.call(addVehicleRoute, { accessToken, body: yaris });
    await api.client.call(declareLicenceRoute, { accessToken, body: { declared: true } });
    const result = await api.client.call(driverReadinessRoute, { accessToken });
    expect(result).toMatchObject({ status: 200, data: { ready: false } });
  });

  it("keeps the date of the first declaration and nothing else", async () => {
    const { accessToken, userId } = await newDriver();
    const first = api.now().toISOString();
    await api.client.call(declareLicenceRoute, { accessToken, body: { declared: true } });
    api.advance(600); // Within the access token's 15 minutes.
    const again = await api.client.call(declareLicenceRoute, {
      accessToken,
      body: { declared: true },
    });
    expect(again).toMatchObject({ data: { licenceDeclaredAt: first } });
    const [user] = await api.connection.db
      .select({ licenceDeclaredAt: schema.users.licenceDeclaredAt })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    expect(user?.licenceDeclaredAt?.toISOString()).toBe(first);
  });

  it("needs a signed-in person", async () => {
    const result = await api.client.call(driverReadinessRoute, {});
    expect(result.status).toBe(401);
  });
});

describe("cars (spec 3, 3.2)", () => {
  // Plates of 8 characters, which Iceland does not issue, so none is real.
  it("adds a car, with the plate in capitals, and lists it", async () => {
    const { accessToken } = await newDriver();
    const added = await api.client.call(addVehicleRoute, {
      accessToken,
      body: { make: " Kia ", model: "Ceed", colour: "blue", registration: "test-0001" },
    });
    expect(added).toMatchObject({
      status: 201,
      data: { make: "Kia", model: "Ceed", colour: "blue", registration: "TEST0001" },
    });
    const listed = await api.client.call(listVehiclesRoute, { accessToken });
    expect(listed).toMatchObject({
      status: 200,
      data: { vehicles: [{ make: "Kia", registration: "TEST0001" }] },
    });
  });

  it("says which field is wrong", async () => {
    const { accessToken } = await newDriver();
    const result = await api.client.call(addVehicleRoute, {
      accessToken,
      body: { ...yaris, registration: "A" },
    });
    expect(result).toMatchObject({
      status: 400,
      error: { code: "vehicle_invalid", details: [{ path: "registration", issue: "invalid" }] },
    });
  });

  it("adds the plate later", async () => {
    const { accessToken } = await newDriver();
    const added = await api.client.call(addVehicleRoute, { accessToken, body: yaris });
    if (!added.ok) throw new Error(added.error.code);
    const updated = await api.client.call(updateVehicleRoute, {
      accessToken,
      params: { id: added.data.id },
      body: { ...yaris, registration: "ÞÓRTEST1" },
    });
    expect(updated).toMatchObject({ status: 200, data: { registration: "ÞÓRTEST1" } });
  });

  it("deletes a removed car with its plate, since no trip uses it yet", async () => {
    const { accessToken } = await newDriver();
    const added = await api.client.call(addVehicleRoute, { accessToken, body: yaris });
    if (!added.ok) throw new Error(added.error.code);
    const removed = await api.client.call(removeVehicleRoute, {
      accessToken,
      params: { id: added.data.id },
    });
    expect(removed.status).toBe(204);
    const listed = await api.client.call(listVehiclesRoute, { accessToken });
    expect(listed).toMatchObject({ data: { vehicles: [] } });
    const left = await api.connection.db
      .select()
      .from(schema.vehicles)
      .where(eq(schema.vehicles.id, added.data.id));
    expect(left).toEqual([]);
    const again = await api.client.call(removeVehicleRoute, {
      accessToken,
      params: { id: added.data.id },
    });
    expect(again.status).toBe(404);
  });

  it("is held to the same rules by the database", async () => {
    const { userId } = await newDriver();
    const insert = (car: Partial<typeof schema.vehicles.$inferInsert>) =>
      api.connection.db
        .insert(schema.vehicles)
        .values({ ownerId: userId, make: "Kia", model: "Ceed", colour: "blue", ...car })
        .then(() => "stored");
    const refusedBy = (constraint: string) => ({ cause: { constraint } });
    await expect(insert({ make: "  " })).rejects.toMatchObject(refusedBy("vehicles_make_check"));
    await expect(insert({ model: "x".repeat(41) })).rejects.toMatchObject(
      refusedBy("vehicles_model_check"),
    );
    await expect(insert({ colour: "pink" })).rejects.toMatchObject(
      refusedBy("vehicles_colour_check"),
    );
    await expect(insert({ registration: "test0001" })).rejects.toMatchObject(
      refusedBy("vehicles_registration_check"),
    );
    await expect(insert({ registration: "TEST-001" })).rejects.toMatchObject(
      refusedBy("vehicles_registration_check"),
    );
    await expect(insert({ model: "x".repeat(40), registration: "ÞÓRTEST1" })).resolves.toBe(
      "stored",
    );
  });

  it("never shows or changes another person's car", async () => {
    const owner = await newDriver();
    const other = await newDriver();
    const added = await api.client.call(addVehicleRoute, {
      accessToken: owner.accessToken,
      body: yaris,
    });
    if (!added.ok) throw new Error(added.error.code);
    const params = { id: added.data.id };
    const listed = await api.client.call(listVehiclesRoute, { accessToken: other.accessToken });
    expect(listed).toMatchObject({ data: { vehicles: [] } });
    const updated = await api.client.call(updateVehicleRoute, {
      accessToken: other.accessToken,
      params,
      body: yaris,
    });
    expect(updated.status).toBe(404);
    const removed = await api.client.call(removeVehicleRoute, {
      accessToken: other.accessToken,
      params,
    });
    expect(removed.status).toBe(404);
  });
});
