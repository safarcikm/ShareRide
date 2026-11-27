import type { CallFailure } from "@shareride/api-client";
import {
  askDataExportRoute,
  dataExportLinkRoute,
  getDataExportRoute,
  type DataExport,
} from "@shareride/contracts";
import { formatClock, formatDayAndMonth, type Translate } from "@shareride/i18n";
import { FilePlus } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { apiBaseUrl } from "@/auth/api";
import { errorText, formatWait } from "@/auth/errors";
import { useMe, useSession } from "@/auth/session";
import { ActionRows } from "@/components/action-rows";
import { Announcer } from "@/components/announcer";
import { Button } from "@/components/button";
import { Loading } from "@/components/loading";
import { ActionNotice, Notice } from "@/components/notice";
import { Row } from "@/components/row";
import { InBar, Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { BackToMenu } from "@/navigation/back-to-menu";
import { ConfirmWithCode } from "@/privacy/confirm-with-code";
import { openDownload } from "@/privacy/open-download";
import { spacing } from "@/theme/tokens";

/** How often the screen looks again while the file is being made. */
const lookEveryMs = 5_000;

type Latest = { readonly ok: true; readonly data: DataExport } | CallFailure;

/**
 * Download my data (spec 11, 3.2; plan 4.4 and 4.9): ask for a file with a
 * fresh code, wait while it is made (the screen looks again every few
 * seconds, says when it changes, and a push and an email say when it is
 * ready), then download it through a one-time link within 7 days. One file
 * a day.
 *
 * The page has one main button, in the bottom bar (spec 31, R31.1): "Make
 * my file" before a file, the code's button while a file is asked for, and
 * "Download the file" once one is ready, with why it did not open over it.
 * Asking for a new file beside a ready one is a row.
 */
export default function DownloadScreen() {
  const me = useMe();
  if (me === null) return <BackToMenu />;
  return <DownloadMyData />;
}

function DownloadMyData() {
  const { locale, t } = useLanguage();
  const session = useSession();
  const [latest, setLatest] = useState<Latest>();
  const [asking, setAsking] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // When a code was last sent, so opening the form again inside the wait
  // uses that code rather than asking for another.
  const [codeWait, setCodeWait] = useState(0);
  // Counts the times the file stopped being prepared while on screen.
  const [changes, setChanges] = useState(0);

  const look = useCallback(async () => {
    const result = await session.call(getDataExportRoute, {});
    return result.ok ? ({ ok: true, data: result.data } as const) : result;
  }, [session]);

  useEffect(() => {
    let active = true;
    void look().then((found) => {
      if (active) setLatest(found);
    });
    return () => {
      active = false;
    };
  }, [look]);

  const preparing = latest?.ok === true && latest.data.state === "preparing";
  useEffect(() => {
    if (!preparing) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Looks again a while after each answer, so a slow network never piles
    // up requests. A failed look keeps what is shown and tries again.
    const later = () => {
      timer = setTimeout(() => {
        void look().then((found) => {
          if (!active) return;
          if (!found.ok) {
            later();
            return;
          }
          setLatest(found);
          if (found.data.state === "preparing") later();
          else setChanges((count) => count + 1);
        });
      }, lookEveryMs);
    };
    later();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [look, preparing]);

  const when = (iso: string) => {
    const at = new Date(iso);
    return t("privacy.when", { date: formatDayAndMonth(at, locale), time: formatClock(at) });
  };

  // Read out when the file is ready, or could not be made, while waiting here.
  const status = latest?.ok === true ? statusText(t, latest.data, when) : null;
  const announcement = useMemo(
    () => (changes > 0 && status !== null ? { text: status, count: changes } : null),
    [changes, status],
  );

  async function ask(code: string) {
    const result = await session.call(askDataExportRoute, { body: { code } });
    if (!result.ok) {
      // Asked for elsewhere today: show that file as it stands.
      if (result.error.code === "export_too_soon") {
        void look().then((found) => {
          if (found.ok) setLatest(found);
        });
      }
      return result;
    }
    setLatest({ ok: true, data: result.data });
    setAsking(false);
    setError(null);
    return { ok: true } as const;
  }

  async function download() {
    setOpening(true);
    setError(null);
    const link = await session.call(dataExportLinkRoute, { body: {} });
    if (link.ok) {
      try {
        await openDownload(`${apiBaseUrl()}${link.data.path}`);
      } catch {
        setError(t("error.generic"));
      }
    } else if (link.error.code === "export_not_ready") {
      // Gone or replaced: the file's new state says why.
      const found = await look();
      setLatest(found);
      if (found.ok && found.data.state === "ready") setError(t("error.export_not_ready"));
    } else {
      setError(errorText(t, link));
    }
    setOpening(false);
  }

  const reload = () => {
    setLatest(undefined);
    void look().then(setLatest);
  };

  return (
    <Screen>
      <ScreenHead
        title={t("privacy.download")}
        line={t("privacy.download.intro")}
        back="/settings/privacy"
      />
      <Announcer message={announcement} />
      {latest === undefined ? (
        <Loading />
      ) : !latest.ok ? (
        <View style={styles.group}>
          <Notice message={errorText(t, latest)} />
          <Button variant="secondary" label={t("common.retry")} onPress={reload} />
        </View>
      ) : (
        <View style={styles.group}>
          <Where latest={latest.data} text={status} />
          {latest.data.state === "ready" && !asking ? (
            <InBar>
              <ActionNotice says={error} />
              <Button
                main
                label={t("privacy.download.file")}
                busy={opening}
                onPress={() => void download()}
              />
            </InBar>
          ) : null}
          {asking ? (
            <ConfirmWithCode
              inBar
              confirmLabel={t("privacy.download.make")}
              sentUntil={codeWait}
              onSent={setCodeWait}
              onConfirm={ask}
              describe={(failure) =>
                failure.error.code === "export_too_soon"
                  ? t("error.export_too_soon", {
                      wait: formatWait(t, failure.error.retryAfterSeconds ?? 0),
                    })
                  : undefined
              }
              onCancel={() => {
                setAsking(false);
              }}
            />
          ) : (
            <Ask
              latest={latest.data}
              when={when}
              onAsk={() => {
                setError(null);
                setAsking(true);
              }}
            />
          )}
        </View>
      )}
    </Screen>
  );
}

/** Where the latest file stands, in words; nothing before the first file. */
function statusText(
  t: Translate,
  latest: DataExport,
  when: (iso: string) => string,
): string | null {
  switch (latest.state) {
    case "none":
      return null;
    case "preparing":
      return t("privacy.preparing");
    case "failed":
      return t("privacy.download.failed");
    case "ready":
      return t("privacy.ready", { date: when(latest.expiresAt) });
    case "expired":
      return t("privacy.download.expired", { date: when(latest.expiresAt) });
  }
}

/** Where the latest file stands: waiting and failing as notices, the rest as text. */
function Where({ latest, text }: { readonly latest: DataExport; readonly text: string | null }) {
  if (text === null) return null;
  switch (latest.state) {
    case "preparing":
      return <Notice kind="info" urgent={false} message={text} />;
    case "failed":
      return <Notice message={text} />;
    default:
      return <Body align="start">{text}</Body>;
  }
}

/** Asking for a file: now, or from when another can be asked for (one a day). */
function Ask({
  latest,
  when,
  onAsk,
}: {
  readonly latest: DataExport;
  readonly when: (iso: string) => string;
  readonly onAsk: () => void;
}) {
  const { t } = useLanguage();
  if (latest.state === "preparing") return null;
  const next = latest.state === "none" ? null : latest.nextAllowedAt;
  if (next !== null) {
    return <Body align="start">{t("privacy.download.nextAt", { date: when(next) })}</Body>;
  }
  if (latest.state === "ready") {
    return (
      <>
        <Body align="start">{t("privacy.download.replaces")}</Body>
        <ActionRows>
          <Row icon={FilePlus} title={t("privacy.download.makeNew")} onPress={onAsk} />
        </ActionRows>
      </>
    );
  }
  return (
    <InBar>
      <Button main label={t("privacy.download.make")} onPress={onAsk} />
    </InBar>
  );
}

const styles = StyleSheet.create({ group: { gap: spacing.md, marginTop: spacing.md } });
