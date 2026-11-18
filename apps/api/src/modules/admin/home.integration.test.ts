import {
  fileReportRoute,
  reportMeetingPointIssueRoute,
  sendFeedbackRoute,
  type AdminHome,
  type AdminSettings,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { sampleId } from "@shareride/db/seed";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  sampleTrip,
  seedForBookings,
} from "../bookings/testing.ts";

// The console's home page (spec 10, 3.1.1; milestone 11, PR 14): each
// count against records made in the test. All made up.

let api: TestApi;
let operator: { cookie: string };

const { airport } = sampleTrip;
const { newMember } = bookingHelpers(() => api);

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
  await freshSampleTrips(api);
  operator = await api.signInOperator();
});

afterAll(async () => {
  await api.close();
});

async function send(method: string, path: string, body?: unknown, cookie = operator.cookie) {
  const response = await api.request(path, {
    method,
    headers: { cookie, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

const home = async () => (await send("GET", "/admin/v1/home")).body as AdminHome;

async function turn(key: string, value: number) {
  const { version } = (await send("GET", "/admin/v1/settings")).body as AdminSettings;
  const changed = await send("PATCH", `/admin/v1/settings/${key}`, {
    value,
    reason: "A test.",
    version,
  });
  if (changed.status !== 200) throw new Error(JSON.stringify(changed.body));
}

describe("GET /admin/v1/home", () => {
  it("is for operators only", async () => {
    expect((await send("GET", "/admin/v1/home", undefined, "")).status).toBe(401);
  });

  it("counts nothing on a quiet day, and the places the beta has left", async () => {
    expect(await home()).toEqual({
      reports: { urgent: 0, other: 0 },
      appeals: 0,
      disputes: 0,
      meetingPointProblems: 0,
      meetingPointReviewsOverdue: 0,
      failedNotifications: 0,
      watched: 0,
      newFeedback: 0,
      // An invite code is needed as the settings are stored: 150 testers at most.
      placesLeft: 150,
      switchesOff: [],
    });
  });

  it("counts open reports by urgency, new feedback and meeting point problems", async () => {
    const gunna = await newMember("Gunna");
    for (const category of ["not_as_listed", "safety", "safety"] as const) {
      const filed = await api.client.call(fileReportRoute, {
        accessToken: gunna.accessToken,
        body: { about: { kind: "trip", tripId: airport }, category },
      });
      if (!filed.ok) throw new Error(filed.error.code);
    }
    const feedback = await api.client.call(sendFeedbackRoute, {
      accessToken: gunna.accessToken,
      body: {
        kind: "problem",
        message: "The map does not move.",
        appVersion: "1.4.0",
        platform: "ios",
        osVersion: "19.1",
        screen: "/trips/[id]",
      },
    });
    if (!feedback.ok) throw new Error(feedback.error.code);
    const problem = await api.client.call(reportMeetingPointIssueRoute, {
      accessToken: gunna.accessToken,
      params: { id: sampleId("point:bsi") },
      body: { reason: "unsafe", note: "" },
    });
    if (!problem.ok) throw new Error(problem.error.code);

    expect(await home()).toMatchObject({
      reports: { urgent: 2, other: 1 },
      newFeedback: 1,
      meetingPointProblems: 1,
    });
  });

  it("counts the notifications that failed in the last 24 hours, and no older", async () => {
    const { db } = api.connection;
    const member = await newMember("Sigga");
    const failedAt = async (at: Date, key: string) => {
      const [notification] = await db
        .insert(schema.notifications)
        .values({
          recipientId: member.userId,
          kind: "meeting_point_changed",
          uniqueKey: key,
          createdAt: at,
          updatedAt: at,
        })
        .returning({ id: schema.notifications.id });
      if (notification === undefined) throw new Error("Not stored.");
      await db.insert(schema.notificationDeliveries).values({
        notificationId: notification.id,
        channel: "sms",
        status: "failed",
        reason: "interrupted",
        attempts: 1,
        createdAt: at,
        updatedAt: at,
      });
    };
    await failedAt(new Date(api.now().getTime() - 23 * 3600 * 1000), "test:home:recent");
    await failedAt(new Date(api.now().getTime() - 25 * 3600 * 1000), "test:home:old");
    expect((await home()).failedNotifications).toBe(1);
  });

  it("names the switches that are off, and has no places to count once no code is needed", async () => {
    await turn("sms_sending", 0);
    await turn("invite_code_required", 0);
    expect(await home()).toMatchObject({ switchesOff: ["sms_sending"], placesLeft: null });
    await turn("sms_sending", 1);
    await turn("invite_code_required", 1);
    expect(await home()).toMatchObject({ switchesOff: [], placesLeft: 150 });
  });
});
