import {
  getNotificationSettingsRoute,
  updateNotificationSettingsRoute,
} from "@shareride/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";

// What a person can turn off (spec 7, 3.6, item 1): trip reminders, on until
// they are turned off. News about bookings, trips, payments and messages
// cannot be (R7.8).

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  await api.close();
});

describe("/v1/me/notification-settings", () => {
  it("has reminders on until they are turned off, and on again", async () => {
    const { accessToken } = await api.signIn(api.newPhoneNumber());
    expect(await api.client.call(getNotificationSettingsRoute, { accessToken })).toMatchObject({
      ok: true,
      data: { reminders: true },
    });
    expect(
      await api.client.call(updateNotificationSettingsRoute, {
        accessToken,
        body: { reminders: false },
      }),
    ).toMatchObject({ ok: true, data: { reminders: false } });
    expect(await api.client.call(getNotificationSettingsRoute, { accessToken })).toMatchObject({
      data: { reminders: false },
    });
    await api.client.call(updateNotificationSettingsRoute, {
      accessToken,
      body: { reminders: true },
    });
    expect(await api.client.call(getNotificationSettingsRoute, { accessToken })).toMatchObject({
      data: { reminders: true },
    });
  });

  it("keeps each person's own", async () => {
    const anna = await api.signIn(api.newPhoneNumber());
    const jon = await api.signIn(api.newPhoneNumber());
    await api.client.call(updateNotificationSettingsRoute, {
      accessToken: anna.accessToken,
      body: { reminders: false },
    });
    expect(
      await api.client.call(getNotificationSettingsRoute, { accessToken: jon.accessToken }),
    ).toMatchObject({ data: { reminders: true } });
  });

  it("needs a sign-in and a yes or no", async () => {
    expect(await api.client.call(getNotificationSettingsRoute, {})).toMatchObject({
      ok: false,
      status: 401,
    });
    const { accessToken } = await api.signIn(api.newPhoneNumber());
    expect(
      await api.client.call(updateNotificationSettingsRoute, {
        accessToken,
        body: { reminders: "no" } as unknown as { reminders: boolean },
      }),
    ).toMatchObject({ ok: false, status: 400 });
  });
});
