// Stands in for expo-notifications in tests (see jest.config.js): the
// permission, the device's token and taps are set by the test through
// `mockNotifications`. Only what the app uses is here.
import { useEffect, useState } from "react";

export const DEFAULT_ACTION_IDENTIFIER = "expo.modules.notifications.actions.DEFAULT";
export const AndroidImportance = { DEFAULT: 5, HIGH: 6 } as const;

interface Content {
  readonly title: string;
  readonly body: string;
  readonly data: Record<string, unknown>;
}
interface Notification {
  readonly date: number;
  readonly request: { readonly identifier: string; readonly content: Content };
}
interface Response {
  readonly actionIdentifier: string;
  readonly notification: Notification;
}
interface Behavior {
  readonly shouldShowBanner: boolean;
  readonly shouldShowList: boolean;
  readonly shouldPlaySound: boolean;
  readonly shouldSetBadge: boolean;
}
interface Handler {
  handleNotification: (notification: Notification) => Promise<Behavior>;
}

let tapped = 0;

function notificationTo(path: string): Notification {
  tapped += 1;
  return {
    date: Date.parse("2026-11-14T12:00:00Z"),
    request: {
      identifier: `notification-${String(tapped)}`,
      content: { title: "Anna", body: "Hi!", data: { path } },
    },
  };
}

export const mockNotifications = {
  permission: "undetermined" as "granted" | "denied" | "undetermined",
  token: "ExponentPushToken[test-device]",
  /** What each token request was given. */
  tokenRequests: [] as { projectId?: string }[],
  channels: [] as { id: string; name: string }[],
  handler: null as Handler | null,
  tokenListeners: new Set<() => void>(),
  responseListeners: new Set<(response: Response | null) => void>(),
  lastResponse: null as Response | null,
  reset() {
    mockNotifications.permission = "undetermined";
    mockNotifications.token = "ExponentPushToken[test-device]";
    mockNotifications.tokenRequests = [];
    mockNotifications.channels = [];
    mockNotifications.handler = null;
    mockNotifications.tokenListeners.clear();
    mockNotifications.responseListeners.clear();
    mockNotifications.lastResponse = null;
  },
  /** The person taps a notification that leads to `path`. */
  tap(path: string, actionIdentifier = DEFAULT_ACTION_IDENTIFIER) {
    const response = { actionIdentifier, notification: notificationTo(path) };
    mockNotifications.lastResponse = response;
    for (const listener of mockNotifications.responseListeners) listener(response);
  },
  /** A notification arrives while the app is open: what the app says to do with it. */
  receive(path: string): Promise<Behavior> | null {
    return mockNotifications.handler?.handleNotification(notificationTo(path)) ?? null;
  },
  /** The device's push token changes. */
  newToken(token: string) {
    mockNotifications.token = token;
    for (const listener of mockNotifications.tokenListeners) listener();
  },
};

export function getPermissionsAsync() {
  const { permission } = mockNotifications;
  return Promise.resolve({ status: permission, granted: permission === "granted" });
}

export function getExpoPushTokenAsync(options: { projectId?: string }) {
  mockNotifications.tokenRequests.push(options);
  return Promise.resolve({ type: "expo", data: mockNotifications.token });
}

export function setNotificationChannelAsync(id: string, channel: { name: string }) {
  mockNotifications.channels.push({ id, name: channel.name });
  return Promise.resolve(null);
}

export function setNotificationHandler(handler: Handler | null) {
  mockNotifications.handler = handler;
}

export function addPushTokenListener(listener: () => void) {
  mockNotifications.tokenListeners.add(listener);
  return {
    remove: () => {
      mockNotifications.tokenListeners.delete(listener);
    },
  };
}

export function useLastNotificationResponse(): Response | null {
  const [response, setResponse] = useState(mockNotifications.lastResponse);
  useEffect(() => {
    mockNotifications.responseListeners.add(setResponse);
    return () => {
      mockNotifications.responseListeners.delete(setResponse);
    };
  }, []);
  return response;
}

export function clearLastNotificationResponse() {
  mockNotifications.lastResponse = null;
}
