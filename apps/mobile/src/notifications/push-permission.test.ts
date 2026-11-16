import { Platform } from "react-native";
import { mockNotifications } from "@/testing/notifications";
import { turnOnPush } from "./push-permission";

jest.mock("@/notifications/project-id", () => ({ projectId: () => "test-project" }));

beforeEach(() => {
  mockNotifications.reset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("turnOnPush", () => {
  it("makes Android's channel before asking, as Android 13 asks only once there is one", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    expect(await turnOnPush("Rides and messages")).toBe(true);
    expect(mockNotifications.channels).toEqual([{ id: "default", name: "Rides and messages" }]);
    expect(mockNotifications.channelsWhenAsked).toBe(1);
  });

  it("makes no channel on iOS", async () => {
    expect(await turnOnPush("Rides and messages")).toBe(true);
    expect(mockNotifications.channels).toEqual([]);
  });
});
