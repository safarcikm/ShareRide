import { myNoticesRoute, type Notice as NoticeData } from "@shareride/contracts";
import { useCallback, useState } from "react";
import { ActivityIndicator } from "react-native";
import { useMe, useSession } from "@/auth/session";
import { Announcer } from "@/components/announcer";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { BackToMenu } from "@/navigation/back-to-menu";
import { NoticeCard } from "@/safety/notices";
import { usePalette } from "@/theme/use-palette";

/**
 * Notices from ShareRide (spec 9, 3.4.4; milestone 9 decision 1), in
 * Profile and where a notice's push opens: what ShareRide did about me and
 * why, the latest first, each with its appeal. Open while suspended. The
 * title is at the left, with what the page is under it (spec 31, 3.19).
 * One appeal is written at a time, so the page never has two main buttons
 * (R31.1).
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
  // The notice whose appeal is being written: one at a time.
  const [appealing, setAppealing] = useState<string | null>(null);

  const header = <ScreenHead title={t("notices.title")} line={t("notices.help")} back="/profile" />;
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
        <Body align="start">{t("notices.none")}</Body>
      ) : (
        notices.map((notice) => (
          <NoticeCard
            key={notice.id}
            notice={notice}
            appealing={appealing === notice.id}
            onAppealing={(now) => {
              setAppealing((open) => (now ? notice.id : open === notice.id ? null : open));
            }}
            onChange={(now) => {
              setChanged((all) => ({ ...all, [now.id]: now }));
            }}
            onStale={() => {
              // Only this notice's own change gives way to the list loaded again.
              setChanged((all) =>
                Object.fromEntries(Object.entries(all).filter(([id]) => id !== notice.id)),
              );
              refresh();
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
