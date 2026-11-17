import {
  meetingPointRoute,
  reportMeetingPointIssueRoute,
  type MeetingPointDetails,
} from "@shareride/contracts";
import {
  characterCount,
  meetingPointIssueLimits,
  meetingPointIssueReasons,
  type MeetingPointIssueReason,
} from "@shareride/domain";
import { issueReasonKeys, type MessageKey } from "@shareride/i18n";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useMe, useSession } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { RadioCard } from "@/components/radio-card";
import { Screen } from "@/components/screen";
import { TakesFocus } from "@/components/takes-focus";
import { TextField } from "@/components/text-field";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { SignInFirst } from "@/navigation/sign-in-first";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

const maxLength = meetingPointIssueLimits.noteMax;

/**
 * "Something wrong here?" (spec 2, 3.5): what is wrong and a note, for the
 * operator's queue. It needs an account, which has a verified phone number
 * (R2.8); signed out, it asks to sign in first. Nothing is sent until
 * "Send".
 */
export default function MeetingPointProblemScreen() {
  const { t } = useLanguage();
  const me = useMe();
  const { id } = useLocalSearchParams<{ id: string }>();
  if (me === null) {
    return (
      <SignInFirst
        title={t("meetingPoints.issue.signIn")}
        body={t("meetingPoints.issue.signInHelp")}
      />
    );
  }
  return <Problem id={id} />;
}

function Problem({ id }: { readonly id: string }) {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const load = useCallback(
    () => session.call(meetingPointRoute, { params: { id } }),
    [id, session],
  );
  const { value: result, reload } = useLoaded(load);
  if (result === undefined) {
    return (
      <Screen>
        <BackButton fallback="/meeting-points" />
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </Screen>
    );
  }
  if (!result.ok) {
    return (
      <Screen>
        <BackButton fallback="/meeting-points" />
        <Notice
          message={
            result.status === 404 || result.status === 400
              ? t("meetingPoints.issue.gone")
              : errorText(t, result)
          }
        />
        <Button variant="secondary" label={t("common.retry")} onPress={reload} />
      </Screen>
    );
  }
  return <ProblemForm point={result.data} />;
}

function ProblemForm({ point }: { readonly point: MeetingPointDetails }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const [reason, setReason] = useState<MeetingPointIssueReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const tooLong = characterCount(note.trim()) > maxLength;

  async function send() {
    setFailed(null);
    if (reason === null) {
      setMissing(true);
      return;
    }
    if (tooLong) return;
    setBusy(true);
    const answer = await session.call(reportMeetingPointIssueRoute, {
      params: { id: point.id },
      body: { reason, note: note.trim() },
    });
    setBusy(false);
    if (answer.ok) {
      setSent(true);
      return;
    }
    const failures: Partial<Record<string, MessageKey>> = {
      not_found: "meetingPoints.issue.gone",
      too_many_reports: "meetingPoints.issue.tooMany",
    };
    const key = failures[answer.error.code];
    setFailed(
      key === undefined ? errorText(t, answer) : t(key, { max: meetingPointIssueLimits.perDay }),
    );
  }

  if (sent) {
    return (
      <Screen>
        <TakesFocus>
          <Title>{t("meetingPoints.issue.thanks")}</Title>
        </TakesFocus>
        <Body>{t("meetingPoints.issue.thanksHelp")}</Body>
        <Button
          variant="secondary"
          label={t("common.back")}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace({ pathname: "/meeting-points/[id]", params: { id: point.id } });
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <BackButton fallback="/meeting-points" />
      <Title>{t("meetingPoints.issue.title")}</Title>
      <Body>{point.name[locale]}</Body>
      <View style={styles.group}>
        <Text style={[typography.label, { color: palette.text }]}>
          {t("meetingPoints.issue.what")}
        </Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t("meetingPoints.issue.what")}
          style={styles.group}
        >
          {meetingPointIssueReasons.map((option) => (
            <RadioCard
              key={option}
              title={t(issueReasonKeys[option])}
              selected={option === reason}
              onSelect={() => {
                setMissing(false);
                setReason(option);
              }}
            />
          ))}
        </View>
        <Notice message={missing ? t("meetingPoints.issue.choose") : null} />
      </View>
      <TextField
        label={t("meetingPoints.issue.note")}
        value={note}
        onChangeText={(text) => {
          setFailed(null);
          setNote(text);
        }}
        multiline
        maxLength={maxLength * 4}
        help={t("meetingPoints.issue.noteHelp", { max: maxLength })}
        error={tooLong ? t("meetingPoints.issue.tooLong", { max: maxLength }) : undefined}
      />
      <Button label={t("meetingPoints.issue.send")} busy={busy} onPress={() => void send()} />
      <Notice message={failed} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
});
