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
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useMe, useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { ActionNotice, Notice } from "@/components/notice";
import { RadioCard } from "@/components/radio-card";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { TextField } from "@/components/text-field";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { useLoaded } from "@/lib/use-loaded";
import { keepPendingProblem } from "@/meeting-points/pending-problem";
import { SignInFirst } from "@/navigation/sign-in-first";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

const maxLength = meetingPointIssueLimits.noteMax;

/** The point's details, where Back leads when nothing is behind this screen. */
const detailsOf = (id: string): Href => ({ pathname: "/meeting-points/[id]", params: { id } });

/**
 * "Something wrong here?" (spec 2, 3.5): what is wrong and a note, for the
 * operator's queue. It needs an account, which has a verified phone number
 * (R2.8); signed out, it asks to sign in first and keeps the point, so
 * the form opens after signing in. Nothing is sent until "Send".
 *
 * The title is at the left with Back, and the point's name is the line
 * under it (spec 31, 3.17). "Send" is the page's one main button, in the
 * bottom bar, with why it was not sent over it (R31.1). Once sent, the
 * thanks are the title, with focus, and the way back is the bar's button
 * (3.19).
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
        back={detailsOf(id)}
        onSignIn={() => {
          void keepPendingProblem(id, now()).then(() => {
            router.push("/sign-in");
          });
        }}
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
  const head = <ScreenHead title={t("meetingPoints.issue.title")} back={detailsOf(id)} />;
  if (result === undefined) {
    return (
      <Screen>
        {head}
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </Screen>
    );
  }
  if (!result.ok) {
    // Trying again cannot bring back a point that is gone.
    const gone = result.status === 404 || result.status === 400;
    return (
      <Screen>
        {head}
        <Notice message={gone ? t("meetingPoints.issue.gone") : errorText(t, result)} />
        {gone ? null : <Button variant="secondary" label={t("common.retry")} onPress={reload} />}
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
    setFailed(key === undefined ? errorText(t, answer) : t(key));
  }

  if (sent) {
    return (
      <Screen
        footer={
          <Button
            main
            label={t("common.back")}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace(detailsOf(point.id));
            }}
          />
        }
      >
        {/* The button pressed is gone: focus moves to what it did. */}
        <ScreenHead
          title={t("meetingPoints.issue.thanks")}
          line={t("meetingPoints.issue.thanksHelp")}
          back={null}
          outcome={{ of: "sent", focus: true }}
        />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          <ActionNotice says={failed} />
          <Button
            main
            label={t("meetingPoints.issue.send")}
            busy={busy}
            onPress={() => void send()}
          />
        </>
      }
    >
      <ScreenHead
        title={t("meetingPoints.issue.title")}
        line={point.name[locale]}
        back={detailsOf(point.id)}
      />
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
});
