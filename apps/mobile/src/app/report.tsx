import {
  bookingRoute,
  fileReportRoute,
  publicProfileRoute,
  type ReportAbout,
} from "@shareride/contracts";
import {
  characterCount,
  defaultSafetySettings,
  reportCategories,
  type ReportCategory,
} from "@shareride/domain";
import { reportCategoryText, type MessageKey } from "@shareride/i18n";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { Ban, BookOpen } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useMe, useSession } from "@/auth/session";
import { otherPerson } from "@/chat/texts";
import { ActionRows } from "@/components/action-rows";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { ActionNotice, Notice, useSaid } from "@/components/notice";
import { RadioCard } from "@/components/radio-card";
import { Row } from "@/components/row";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { TextField } from "@/components/text-field";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { BackToMenu } from "@/navigation/back-to-menu";
import { firstNameOf } from "@/people/texts";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

type About = ReportAbout;
type Kind = About["kind"];

const titles = {
  trip: "report.trip",
  message: "report.message",
  booking: "report.problem",
  user: "report.person",
  review: "report.review",
  profile: "report.person",
} as const satisfies Record<Kind, MessageKey>;

/** The person reported, by first name, and where to block them too. */
interface Person {
  readonly name: string;
  readonly block: Href;
}

const maxLength = defaultSafetySettings.textMaxLength;

/**
 * Reporting (spec 9, 3.1): what is reported comes from where the report
 * started, then what happened. Nothing is sent until "Send report", the
 * main button, in the bar, with why nothing was sent over it (spec 31,
 * 3.19); the community rules are a row. Then the title thanks, with focus,
 * Back is the main button, and for a person there is Block them too, a
 * red row. The
 * address names only what is reported, never a person's user ID: their
 * first name comes from the booking the two share, or from the profile.
 * A review names nobody: its author has no profile reference on it.
 */
export default function ReportScreen() {
  const me = useMe();
  const params = useLocalSearchParams<{ kind: string; id: string; booking?: string }>();
  if (me === null) return <BackToMenu />;
  const about = aboutOf(params.kind, params.id);
  if (about === null) return <BackToMenu />;
  switch (about.kind) {
    case "trip":
    case "review":
      return <Report about={about} person={null} />;
    case "profile":
      return <ThroughProfile about={about} />;
    default: {
      const bookingId = about.kind === "message" ? params.booking : about.bookingId;
      if (bookingId === undefined) return <BackToMenu />;
      return <ThroughBooking about={about} bookingId={bookingId} />;
    }
  }
}

function aboutOf(kind: string, id: string): About | null {
  switch (kind) {
    case "trip":
      return { kind, tripId: id };
    case "message":
      return { kind, messageId: id };
    case "booking":
    case "user":
      return { kind, bookingId: id };
    case "review":
      return { kind, reviewId: id };
    case "profile":
      return { kind, profileId: id };
    default:
      return null;
  }
}

/** A person, their message or a booking problem: named through the booking. */
function ThroughBooking({
  about,
  bookingId,
}: {
  readonly about: About;
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
  const booking = answer.data;
  return (
    <Report
      about={about}
      person={{
        name: firstNameOf(t, otherPerson(booking)),
        block: { pathname: "/bookings/[id]/block", params: { id: booking.id } },
      }}
    />
  );
}

/** A person reported from their profile: named by it (spec 9, 3.1.1). */
function ThroughProfile({ about }: { readonly about: Extract<About, { kind: "profile" }> }) {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const { profileId } = about;
  const load = useCallback(
    () => session.call(publicProfileRoute, { params: { profileId } }),
    [session, profileId],
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
    // Someone who left, or an address that is no profile's: nothing to report.
    const gone = answer.status === 404 || answer.status === 400;
    return (
      <Screen>
        <BackButton fallback="/" />
        <Notice message={gone ? t("report.gone") : errorText(t, answer)} />
        {gone ? null : <Button variant="secondary" label={t("common.retry")} onPress={reload} />}
      </Screen>
    );
  }
  return (
    <Report
      about={about}
      person={{
        name: answer.data.firstName,
        block: { pathname: "/people/[profileId]/block", params: { profileId } },
      }}
    />
  );
}

function Report({
  about,
  person,
}: {
  readonly about: About;
  /** Whom it reports, to block them too; none for a trip or a review. */
  readonly person: Person | null;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, say] = useSaid();
  const [sent, setSent] = useState(false);
  const tooLong = characterCount(description.trim()) > maxLength;

  async function send() {
    if (category === null) {
      say(t("report.choose"));
      return;
    }
    if (tooLong) {
      // The field says so too, further up: here it is seen and heard.
      say(t("report.tooLong", { max: maxLength }));
      return;
    }
    say(null);
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
    say(key === undefined ? errorText(t, result) : t(key));
  }

  if (sent) {
    // Blocking needs the person: through a booking the two share, or a profile.
    return (
      <Screen
        footer={
          // The way back is the one thing left to do: the main button.
          <Button
            main
            label={t("common.back")}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/");
            }}
          />
        }
      >
        {/* The button pressed is gone: focus moves to what it did. */}
        <ScreenHead title={t("report.thanks")} back={null} outcome={{ of: "sent", focus: true }} />
        <Body align="start">{t("report.thanksHelp")}</Body>
        {person === null ? null : (
          <ActionRows>
            <Row
              danger
              icon={Ban}
              title={t("report.blockToo", { name: person.name })}
              onPress={() => {
                router.replace(person.block);
              }}
            />
          </ActionRows>
        )}
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          <ActionNotice says={notice} />
          <Button main label={t("report.send")} busy={busy} onPress={() => void send()} />
        </>
      }
    >
      <ScreenHead title={t(titles[about.kind], { name: person?.name ?? "" })} />
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
                say(null);
                setCategory(option);
              }}
            />
          ))}
        </View>
      </View>
      <TextField
        label={t("report.description")}
        value={description}
        onChangeText={(text) => {
          say(null);
          setDescription(text);
        }}
        multiline
        maxLength={maxLength * 4}
        help={t("report.descriptionHelp", { max: maxLength })}
        error={tooLong ? t("report.tooLong", { max: maxLength }) : undefined}
      />
      <ActionRows>
        <Row icon={BookOpen} title={t("report.rules")} href="/legal/community-rules" />
      </ActionRows>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
});
