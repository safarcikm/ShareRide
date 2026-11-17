import {
  bookingRoute,
  fileReportRoute,
  type Booking,
  type ReportAbout,
} from "@shareride/contracts";
import {
  characterCount,
  defaultSafetySettings,
  reportCategories,
  type ReportCategory,
} from "@shareride/domain";
import { reportCategoryText, type MessageKey } from "@shareride/i18n";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useMe, useSession } from "@/auth/session";
import { otherPerson } from "@/chat/texts";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { RadioCard } from "@/components/radio-card";
import { Screen } from "@/components/screen";
import { TakesFocus } from "@/components/takes-focus";
import { TextField } from "@/components/text-field";
import { TextLink } from "@/components/text-link";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { BackToMenu } from "@/navigation/back-to-menu";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

type Kind = ReportAbout["kind"];

const titles = {
  trip: "report.trip",
  message: "report.message",
  booking: "report.problem",
  user: "report.person",
} as const satisfies Record<Kind, MessageKey>;

const maxLength = defaultSafetySettings.textMaxLength;

/**
 * Reporting (spec 9, 3.1): what is reported comes from where the report
 * started, then what happened; for safety, 112 first. Nothing is sent
 * until "Send report". Thanks, and for a person, Block them too. The
 * address names only what is reported, never a person: their first name
 * comes from the booking the two share.
 */
export default function ReportScreen() {
  const me = useMe();
  const params = useLocalSearchParams<{ kind: string; id: string; booking?: string }>();
  if (me === null) return <BackToMenu />;
  const about = aboutOf(params.kind, params.id);
  if (about === null) return <BackToMenu />;
  if (about.kind === "trip") return <Report about={about} booking={null} />;
  const bookingId = about.kind === "message" ? params.booking : about.bookingId;
  if (bookingId === undefined) return <BackToMenu />;
  return <ThroughBooking about={about} bookingId={bookingId} />;
}

function aboutOf(kind: string, id: string): ReportAbout | null {
  switch (kind) {
    case "trip":
      return { kind, tripId: id };
    case "message":
      return { kind, messageId: id };
    case "booking":
    case "user":
      return { kind, bookingId: id };
    default:
      return null;
  }
}

/** A person, their message or a booking problem: named through the booking. */
function ThroughBooking({
  about,
  bookingId,
}: {
  readonly about: ReportAbout;
  readonly bookingId: string;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const load = useCallback(
    () => session.call(bookingRoute, { params: { id: bookingId } }),
    [session, bookingId],
  );
  const { value: answer, reload } = useLoaded(load);
  if (answer === undefined) {
    return (
      <Screen>
        <BackButton fallback="/" />
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </Screen>
    );
  }
  if (!answer.ok) {
    return (
      <Screen>
        <BackButton fallback="/" />
        <Notice message={answer.status === 404 ? t("report.gone") : errorText(t, answer)} />
        <Button variant="secondary" label={t("common.retry")} onPress={reload} />
      </Screen>
    );
  }
  return <Report about={about} booking={answer.data} />;
}

function Report({
  about,
  booking,
}: {
  readonly about: ReportAbout;
  /** The booking the two share; none for a trip. */
  readonly booking: Booking | null;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [callFailed, setCallFailed] = useState(false);
  const tooLong = characterCount(description.trim()) > maxLength;
  const name = booking === null ? null : otherPerson(booking).firstName;

  async function send() {
    setFailed(null);
    if (category === null) {
      setMissing(true);
      return;
    }
    if (tooLong) return;
    setBusy(true);
    const result = await session.call(fileReportRoute, {
      body: { about, category, description: description.trim() },
    });
    setBusy(false);
    if (result.ok) {
      setSent(true);
      return;
    }
    const failures: Partial<Record<string, MessageKey>> = {
      not_found: "report.gone",
      cannot_report_own: "report.gone",
      not_reportable: "report.gone",
      report_window_closed: "report.windowClosed",
      too_many_reports: "report.tooMany",
    };
    const key = failures[result.error.code];
    setFailed(key === undefined ? errorText(t, result) : t(key));
  }

  if (sent) {
    // Blocking needs a booking the two share (a person, a message, a booking).
    return (
      <Screen>
        <TakesFocus>
          <Title>{t("report.thanks")}</Title>
        </TakesFocus>
        <Body>{t("report.thanksHelp")}</Body>
        {booking === null ? null : (
          <Button
            variant="secondary"
            label={t("report.blockToo", { name: otherPerson(booking).firstName })}
            onPress={() => {
              router.replace({ pathname: "/bookings/[id]/block", params: { id: booking.id } });
            }}
          />
        )}
        <Button
          variant={booking === null ? "secondary" : "text"}
          label={t("common.back")}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/");
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <BackButton fallback="/" />
      <Title>{t(titles[about.kind], { name: name ?? "" })}</Title>
      {category === "safety" ? (
        // In danger, 112 comes before anything else (3.1.3), read out at once.
        <Card>
          <Notice message={t("report.emergency")} />
          <Button
            label={t("safety.call112")}
            accessibilityLabel={t("safety.call112Label")}
            onPress={() => {
              setCallFailed(false);
              Linking.openURL("tel:112").catch(() => {
                setCallFailed(true);
              });
            }}
          />
          <Notice message={callFailed ? t("safety.callFailed") : null} />
        </Card>
      ) : null}
      {about.kind === "user" ? <Body align="start">{t("report.personHint")}</Body> : null}
      <View style={styles.group}>
        <Text style={[typography.label, { color: palette.text }]}>{t("report.what")}</Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t("report.what")}
          style={styles.group}
        >
          {reportCategories.map((option) => (
            <RadioCard
              key={option}
              title={reportCategoryText(t, option)}
              selected={option === category}
              onSelect={() => {
                setMissing(false);
                setCategory(option);
              }}
            />
          ))}
        </View>
        <Notice message={missing ? t("report.choose") : null} />
      </View>
      <TextField
        label={t("report.description")}
        value={description}
        onChangeText={(text) => {
          setFailed(null);
          setDescription(text);
        }}
        multiline
        maxLength={maxLength * 4}
        help={t("report.descriptionHelp", { max: maxLength })}
        error={tooLong ? t("report.tooLong", { max: maxLength }) : undefined}
      />
      <TextLink
        label={t("report.rules")}
        onPress={() => {
          router.push("/legal/community-rules");
        }}
      />
      <Button label={t("report.send")} busy={busy} onPress={() => void send()} />
      <Notice message={failed} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
});
