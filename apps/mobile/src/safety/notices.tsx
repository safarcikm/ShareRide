import { appealNoticeRoute, type Notice as NoticeData } from "@shareride/contracts";
import { characterCount, defaultSafetySettings } from "@shareride/domain";
import {
  formatClock,
  formatDate,
  formatDay,
  moderationRuleText,
  type Locale,
  type MessageKey,
  type Translate,
} from "@shareride/i18n";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { TextField } from "@/components/text-field";
import { useLanguage } from "@/i18n/language";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

const maxLength = defaultSafetySettings.textMaxLength;

const contentKeys = {
  message: "notices.content.message",
  review: "notices.content.review",
  trip_note: "notices.content.tripNote",
  about: "notices.content.about",
  trip: "notices.content.trip",
  booking: "notices.content.booking",
} as const satisfies Record<NonNullable<NoticeData["content"]>["kind"], MessageKey>;

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
 */
export function NoticeCard({
  notice,
  onChange,
  onStale,
  onAnnounce,
}: {
  readonly notice: NoticeData;
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
        <Text accessibilityRole="header" style={strong}>
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
          <Text style={body}>
            {t("notices.concerns", { content: t(contentKeys[notice.content.kind]) })}
          </Text>
        )}
        <Appeal notice={notice} onChange={onChange} onStale={onStale} onAnnounce={onAnnounce} />
      </View>
    </Card>
  );
}

function Appeal({
  notice,
  onChange,
  onStale,
  onAnnounce,
}: {
  readonly notice: NoticeData;
  readonly onChange: (notice: NoticeData) => void;
  readonly onStale: () => void;
  readonly onAnnounce: (text: string) => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
        <Notice message={failed} />
      </>
    );
  }

  async function send() {
    setFailed(null);
    const trimmed = text.trim();
    if (trimmed === "") {
      setProblem(t("notices.appealEmpty"));
      return;
    }
    if (characterCount(trimmed) > maxLength) return;
    setBusy(true);
    const result = await session.call(appealNoticeRoute, {
      params: { id: notice.id },
      body: { text: trimmed },
    });
    setBusy(false);
    if (result.ok) {
      onAnnounce(t("notices.appealSent"));
      onChange(result.data);
      return;
    }
    switch (result.error.code) {
      case "already_appealed":
      case "appeal_window_closed":
      case "not_appealable":
      case "not_found":
        setFailed(t("notices.appealGone"));
        onStale();
        return;
      default:
        setFailed(errorText(t, result));
    }
  }

  const tooLong = characterCount(text.trim()) > maxLength;
  return (
    <View style={styles.appeal}>
      <Text style={body}>{t("notices.appealUntil", { until })}</Text>
      {open ? (
        <>
          <TextField
            label={t("notices.appealLabel")}
            value={text}
            onChangeText={(value) => {
              setProblem(null);
              setFailed(null);
              setText(value);
            }}
            multiline
            autoFocus
            maxLength={maxLength * 4}
            help={t("notices.appealHelp", { max: maxLength })}
            error={tooLong ? t("report.tooLong", { max: maxLength }) : (problem ?? undefined)}
          />
          <Button label={t("notices.sendAppeal")} busy={busy} onPress={() => void send()} />
          <Button
            variant="secondary"
            label={t("common.cancel")}
            onPress={() => {
              setOpen(false);
              setProblem(null);
              setFailed(null);
            }}
          />
        </>
      ) : (
        <Button
          variant="secondary"
          label={t("notices.appeal")}
          onPress={() => {
            setOpen(true);
          }}
        />
      )}
      <Notice message={failed} />
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { gap: spacing.xs },
  appeal: { gap: spacing.sm, marginTop: spacing.sm },
});
