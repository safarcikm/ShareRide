import { appealNoticeRoute, type Notice as NoticeData } from "@shareride/contracts";
import { characterCount, defaultSafetySettings } from "@shareride/domain";
import {
  formatClock,
  formatDate,
  formatDay,
  moderatedContentText,
  moderationRuleText,
  type Locale,
  type Translate,
} from "@shareride/i18n";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { ActionNotice, Notice, useSaid } from "@/components/notice";
import { InBar } from "@/components/screen";
import { sectionLevel } from "@/components/text";
import { TextField } from "@/components/text-field";
import { useLanguage } from "@/i18n/language";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

const maxLength = defaultSafetySettings.textMaxLength;

/** "Sunday 13 December at 12:00", in Iceland's time. */
export function momentText(t: Translate, locale: Locale, iso: string): string {
  const moment = new Date(iso);
  return t("notify.when", { date: formatDay(moment, locale), time: formatClock(moment) });
}

/** What ShareRide did, as the push said it (spec 9, 3.4.4). */
export function noticeTitle(t: Translate, locale: Locale, notice: NoticeData): string {
  if (notice.kind !== "suspension") return t(`notice.title.${notice.kind}`);
  return notice.until === null
    ? t("notice.title.suspensionPermanent")
    : t("notice.title.suspension", { until: momentText(t, locale, notice.until) });
}

/**
 * One notice (R9.5): what was done, the rule, the reason as ShareRide wrote
 * it, what it concerned, and the appeal: once, within 14 days, with
 * ShareRide's answer when it comes. Never which operator.
 *
 * One appeal is written at a time, which the page keeps (`appealing`):
 * "Send appeal" is then the page's one main button, in its bottom bar,
 * with why it was not sent over it (spec 31, R31.1).
 */
export function NoticeCard({
  notice,
  appealing,
  onAppealing,
  onChange,
  onStale,
  onAnnounce,
}: {
  readonly notice: NoticeData;
  /** This notice's appeal is the one being written. */
  readonly appealing: boolean;
  /** Told when its appeal is opened to write, and when it is left. */
  readonly onAppealing: (appealing: boolean) => void;
  /** The notice as the API now has it, after an appeal. */
  readonly onChange: (notice: NoticeData) => void;
  /** The appeal was refused as the notice changed meanwhile: load it again. */
  readonly onStale: () => void;
  readonly onAnnounce: (text: string) => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const strong = [typography.bodyStrong, { color: palette.text }];
  const body = [typography.body, { color: palette.text }];
  const muted = [typography.small, { color: palette.textMuted }];
  return (
    <Card>
      <View style={styles.notice}>
        <Text accessibilityRole="header" {...sectionLevel} style={strong}>
          {noticeTitle(t, locale, notice)}
        </Text>
        <Text style={muted}>
          {/* With the year: a notice is kept for years (Iceland keeps UTC). */}
          {t("reports.sent", { date: formatDate(notice.at.slice(0, 10), locale) })}
        </Text>
        {notice.rule === null ? null : (
          <Text style={body}>{t("notice.rule", { rule: moderationRuleText(t, notice.rule) })}</Text>
        )}
        <Text style={body}>
          {notice.kind === "reinstatement"
            ? t("notice.note", { note: notice.reason })
            : t("notice.reason", { reason: notice.reason })}
        </Text>
        {notice.content === null ? null : (
          <Text style={body}>{moderatedContentText(t, notice.content.kind)}</Text>
        )}
        <Appeal
          notice={notice}
          open={appealing}
          onOpen={onAppealing}
          onChange={onChange}
          onStale={onStale}
          onAnnounce={onAnnounce}
        />
      </View>
    </Card>
  );
}

function Appeal({
  notice,
  open,
  onOpen,
  onChange,
  onStale,
  onAnnounce,
}: {
  readonly notice: NoticeData;
  readonly open: boolean;
  readonly onOpen: (open: boolean) => void;
  readonly onChange: (notice: NoticeData) => void;
  readonly onStale: () => void;
  readonly onAnnounce: (text: string) => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  // The appeal just sent was refused, as the notice changed meanwhile.
  const [gone, setGone] = useState(false);
  // What is written, kept here while its form is closed.
  const [text, setText] = useState("");
  const body = [typography.body, { color: palette.text }];
  const muted = [typography.small, { color: palette.textMuted }];

  const { appeal } = notice;
  if (appeal !== null) {
    return (
      <View style={styles.appeal}>
        <Text style={[typography.bodyStrong, { color: palette.text }]}>
          {t("notices.yourAppeal", { date: formatDate(appeal.sentAt.slice(0, 10), locale) })}
        </Text>
        <Text style={body}>{appeal.text}</Text>
        {appeal.answer === null ? (
          <Text style={muted}>{t("notices.waiting")}</Text>
        ) : (
          <>
            <Text style={[typography.bodyStrong, { color: palette.text }]}>
              {t(appeal.outcome === "reversed" ? "notices.answerReversed" : "notices.answerUpheld")}
            </Text>
            <Text style={body}>{appeal.answer}</Text>
          </>
        )}
      </View>
    );
  }
  if (notice.appealUntil === null) return null;
  const until = momentText(t, locale, notice.appealUntil);
  if (!notice.canAppeal) {
    return (
      <>
        <Text style={muted}>{t("notices.appealClosed", { until })}</Text>
        {/* Why the appeal just sent was refused, after loading the notices again. */}
        <Notice message={gone ? t("notices.appealGone") : null} />
      </>
    );
  }

  return (
    <View style={styles.appeal}>
      <Text style={body}>{t("notices.appealUntil", { until })}</Text>
      {open ? (
        <AppealForm
          notice={notice}
          text={text}
          onText={setText}
          onSent={(now) => {
            onOpen(false);
            onAnnounce(t("notices.appealSent"));
            onChange(now);
          }}
          onGone={() => {
            setGone(true);
            onOpen(false);
            onStale();
          }}
          onCancel={() => {
            onOpen(false);
          }}
        />
      ) : (
        <>
          <Button
            variant="secondary"
            label={t("notices.appeal")}
            onPress={() => {
              setGone(false);
              onOpen(true);
            }}
          />
          {/* Until the notices are loaded again, and if that fails. */}
          <Notice message={gone ? t("notices.appealGone") : null} />
        </>
      )}
    </View>
  );
}

/**
 * Writing an appeal. What is written is its notice's to keep: an appeal is
 * sent once, so closing its form, with Cancel or for another notice's
 * appeal, loses nothing.
 */
function AppealForm({
  notice,
  text,
  onText,
  onSent,
  onGone,
  onCancel,
}: {
  readonly notice: NoticeData;
  readonly text: string;
  readonly onText: (text: string) => void;
  readonly onSent: (notice: NoticeData) => void;
  /** Refused as the notice changed meanwhile. */
  readonly onGone: () => void;
  readonly onCancel: () => void;
}) {
  const { t } = useLanguage();
  const session = useSession();
  const [problem, setProblem] = useState<string | null>(null);
  // Why Send appeal did nothing: said over it, as the field can be out of sight.
  const [said, say] = useSaid();
  const [busy, setBusy] = useState(false);

  async function send() {
    const trimmed = text.trim();
    if (trimmed === "") {
      setProblem(t("notices.appealEmpty"));
      say(t("notices.appealEmpty"));
      return;
    }
    if (characterCount(trimmed) > maxLength) {
      say(t("report.tooLong", { max: maxLength }));
      return;
    }
    say(null);
    setBusy(true);
    const result = await session.call(appealNoticeRoute, {
      params: { id: notice.id },
      body: { text: trimmed },
    });
    setBusy(false);
    if (result.ok) {
      onSent(result.data);
      return;
    }
    switch (result.error.code) {
      case "already_appealed":
      case "appeal_window_closed":
      case "not_appealable":
      case "not_found":
        onGone();
        return;
      default:
        say(errorText(t, result));
    }
  }

  const tooLong = characterCount(text.trim()) > maxLength;
  return (
    <>
      <TextField
        label={t("notices.appealLabel")}
        value={text}
        onChangeText={(value) => {
          setProblem(null);
          say(null);
          onText(value);
        }}
        multiline
        autoFocus
        maxLength={maxLength * 4}
        help={t("notices.appealHelp", { max: maxLength })}
        error={tooLong ? t("report.tooLong", { max: maxLength }) : (problem ?? undefined)}
      />
      <Button variant="secondary" label={t("common.cancel")} onPress={onCancel} />
      <InBar>
        <ActionNotice says={said} />
        <Button main label={t("notices.sendAppeal")} busy={busy} onPress={() => void send()} />
      </InBar>
    </>
  );
}

const styles = StyleSheet.create({
  notice: { gap: spacing.xs },
  appeal: { gap: spacing.sm, marginTop: spacing.sm },
});
