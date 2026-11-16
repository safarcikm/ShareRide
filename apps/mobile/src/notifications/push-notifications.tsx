import { setPushTokenRoute } from "@shareride/contracts";
import {
  AndroidImportance,
  DEFAULT_ACTION_IDENTIFIER,
  addPushTokenListener,
  clearLastNotificationResponse,
  getDevicePushTokenAsync,
  getExpoPushTokenAsync,
  getPermissionsAsync,
  setNotificationChannelAsync,
  setNotificationHandler,
  useLastNotificationResponse,
  type DevicePushToken,
} from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useSession, useSessionState } from "@/auth/session";
import { useUnread } from "@/chat/unread";
import { useLanguage } from "@/i18n/language";
import { reportError } from "@/lib/error-reporting";
import { fetchIfShowing } from "./open-conversation";
import { notificationPath } from "./paths";
import { projectId } from "./project-id";

/**
 * Push on a phone (plan 4.5). Once notifications are allowed (asked for
 * elsewhere, never at start), the device's token is registered at each
 * start and whenever it changes. A tap opens what the notification is
 * about, from a cold start too, once the account is complete. While the
 * app is open, a push shows as a banner, except one about the conversation
 * on screen, which is fetched instead.
 */
export function PushNotifications() {
  const state = useSessionState();
  const session = useSession();
  const router = useRouter();
  const { t } = useLanguage();
  const me = state.status === "signedIn" ? state.me : null;
  const userId = me?.id ?? null;
  const complete = me !== null && me.missingSteps.length === 0;
  const channelName = t("notify.channel");
  const { refresh: refreshUnread } = useUnread();
  // The handler is set once; it reaches the badge's latest refresh through this.
  const unread = useRef(refreshUnread);
  useEffect(() => {
    unread.current = refreshUnread;
  }, [refreshUnread]);

  useEffect(() => {
    setNotificationHandler({
      handleNotification: (notification) => {
        // A push is often a new message: the badge asks again.
        unread.current();
        const path = notificationPath(notification.request.content.data);
        const quiet = path !== null && fetchIfShowing(path);
        return Promise.resolve({
          shouldShowBanner: !quiet,
          shouldShowList: !quiet,
          shouldPlaySound: !quiet,
          shouldSetBadge: false,
        });
      },
    });
  }, []);

  useEffect(() => {
    const project = projectId();
    if (userId === null || project === undefined) return;
    // False once this person signs out, or the app goes.
    const still = { here: true };
    const gone = () => !still.here;
    // The phone's token registered last, or being registered. Getting the
    // token also announces it to the listener below, so each is registered
    // once, never in a loop.
    const last: { device: unknown } = { device: null };
    const register = async (device: DevicePushToken) => {
      if (device.data === last.device) return;
      last.device = device.data;
      try {
        const { granted } = await getPermissionsAsync();
        if (!granted || gone()) {
          last.device = null;
          return;
        }
        // From the phone's token as given, so nothing is announced again.
        const { data: token } = await getExpoPushTokenAsync({
          projectId: project,
          devicePushToken: device,
        });
        if (gone()) return;
        await session.call(setPushTokenRoute, { body: { token } });
      } catch (error) {
        last.device = null;
        throw error;
      }
    };
    const start = async () => {
      const { granted } = await getPermissionsAsync();
      if (!granted || gone()) return;
      if (Platform.OS === "android") {
        await setNotificationChannelAsync("default", {
          name: channelName,
          importance: AndroidImportance.HIGH,
        });
      }
      await register(await getDevicePushTokenAsync());
    };
    // Not getting a token is no reason to stop the app; the next start tries again.
    start().catch(reportError);
    const changes = addPushTokenListener((device) => {
      register(device).catch(reportError);
    });
    return () => {
      still.here = false;
      changes.remove();
    };
  }, [userId, session, channelName]);

  const response = useLastNotificationResponse();
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!complete || response === null || response === undefined) return;
    if (response.actionIdentifier !== DEFAULT_ACTION_IDENTIFIER) return;
    const { identifier, content } = response.notification.request;
    if (opened.current === identifier) return;
    opened.current = identifier;
    const path = notificationPath(content.data);
    if (path !== null) router.push(path);
    clearLastNotificationResponse();
  }, [complete, response, router]);

  return null;
}
