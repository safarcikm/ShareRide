import { useMe } from "@/auth/session";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { useLanguage } from "@/i18n/language";
import { BackToMenu } from "@/navigation/back-to-menu";
import { NotificationSwitches } from "@/notifications/notification-switches";

/**
 * Notifications, a page of Profile (spec 31, 3.14 item 2): the switches
 * for ride reminders (spec 7, 3.6) and beta news (spec 10, 3.5.4), the line
 * about what is always on, and the way to the beta news. Signed out, it
 * closes back to the menu.
 */
export default function NotificationsScreen() {
  const me = useMe();
  const { t } = useLanguage();
  if (me === null) return <BackToMenu />;
  return (
    <Screen>
      <ScreenHead title={t("settings.notifications")} back="/profile" />
      <NotificationSwitches />
    </Screen>
  );
}
