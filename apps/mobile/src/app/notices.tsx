import { myNoticesRoute, type Notice as NoticeData } from "@shareride/contracts";
import { useCallback, useState } from "react";
import { ActivityIndicator } from "react-native";
import { useMe, useSession } from "@/auth/session";
import { Announcer } from "@/components/announcer";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { BackToMenu } from "@/navigation/back-to-menu";
import { NoticeCard } from "@/safety/notices";
import { usePalette } from "@/theme/use-palette";

/**
 * Notices from ShareRide (spec 9, 3.4.4; milestone 9 decision 1), in
 * Profile and where a notice's push opens: what ShareRide did about me and
 * why, the latest first, each with its appeal. Open while suspended.
 */
export default function NoticesScreen() {
  const me = useMe();
  if (me === null) return <BackToMenu />;
  return <Notices />;
}

function Notices() {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const load = useCallback(() => session.call(myNoticesRoute, {}), [session]);
  const { value: answer, reload, refresh } = useLoaded(load);
  // Notices as an appeal just left them, over the list as loaded.
  const [changed, setChanged] = useState<Readonly<Record<string, NoticeData>>>({});
  const [announcement, setAnnouncement] = useState<{ text: string; count: number } | null>(null);

  const header = (
    <>
      <BackButton fallback="/profile" />
      <Title>{t("notices.title")}</Title>
      <Body>{t("notices.help")}</Body>
    </>
  );
  if (answer === undefined) {
    return (
      <Screen>
        {header}
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </Screen>
    );
  }
  if (!answer.ok) {
    return (
      <Screen>
        {header}
        <Notice message={t("notices.failed")} />
        <Button variant="secondary" label={t("common.retry")} onPress={reload} />
      </Screen>
    );
  }
  const notices = answer.data.notices.map((notice) => changed[notice.id] ?? notice);
  return (
    <Screen>
      {header}
      <Announcer message={announcement} />
      {notices.length === 0 ? (
        <Body>{t("notices.none")}</Body>
      ) : (
        notices.map((notice) => (
          <NoticeCard
            key={notice.id}
            notice={notice}
            onChange={(now) => {
              if (now === null) {
                setChanged({});
                refresh();
                return;
              }
              setChanged((all) => ({ ...all, [now.id]: now }));
            }}
            onAnnounce={(text) => {
              setAnnouncement((last) => ({ text, count: (last?.count ?? 0) + 1 }));
            }}
          />
        ))
      )}
    </Screen>
  );
}
