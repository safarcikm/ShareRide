import {
  driverReadinessRoute,
  listSignInMethodsRoute,
  listVehiclesRoute,
  publicProfileRoute,
  type Me,
} from "@shareride/contracts";
import { formatPhoneNumber, peopleColourOf } from "@shareride/domain";
import { router } from "expo-router";
import {
  Ban,
  Bell,
  BellRing,
  Car,
  FileText,
  Flag,
  IdCard,
  Inbox,
  Info,
  KeyRound,
  Languages,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Megaphone,
  Phone,
} from "lucide-react-native";
import { useCallback, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useMe, useSession } from "@/auth/session";
import { useSignOut } from "@/auth/use-sign-out";
import { useOpenFeedback } from "@/beta/feedback";
import { ShakeRow } from "@/beta/shake";
import { ActionRows } from "@/components/action-rows";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Columns } from "@/components/columns";
import { LanguageSwitch } from "@/components/language-switch";
import { Notice } from "@/components/notice";
import { Row } from "@/components/row";
import { Screen, useWideScreen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { Heading } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { useSaveLanguage } from "@/i18n/use-save-language";
import { dayOf } from "@/lib/days";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { openPlace } from "@/navigation/open-place";
import { SignInFirst } from "@/navigation/sign-in-first";
import { languagesText } from "@/people/languages";
import { PersonCard } from "@/people/person-card";
import { memberSinceText } from "@/people/texts";
import { PhotoControls } from "@/profile/photo-controls";
import { providerNames } from "@/sign-in/provider-window";
import { sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * Profile, a place of the menu (spec 16, 3.1). Signed in, my profile and
 * what was Settings on one page (spec 31, 3.14): the title at the left,
 * who I am in a card, then groups of rows, each row with what is set now
 * and each opening the page it had before: Driving, Account, Safety and
 * privacy, Help, and Sign out, which signs out of this device and returns
 * to Find. Signed out: what an account is for and Sign in, then the rows
 * for the meeting points and About, and the language, in one centred
 * column on any screen.
 */
export default function ProfileScreen() {
  const me = useMe();
  return me === null ? <SignedOut /> : <MyProfile me={me} />;
}

function SignedOut() {
  const { t } = useLanguage();
  const saveLanguage = useSaveLanguage();
  return (
    <SignInFirst title={t("nav.profile")} body={t("profile.welcome")}>
      <View style={styles.links}>
        <Card>
          <Row
            title={t("meetingPoints.title")}
            onPress={() => {
              router.push("/meeting-points");
            }}
          />
          <Row
            title={t("about.title")}
            onPress={() => {
              router.push("/about");
            }}
          />
        </Card>
        <LanguageSwitch onSwitch={saveLanguage} />
      </View>
    </SignInFirst>
  );
}

function MyProfile({ me }: { readonly me: Me }) {
  const { locale, t } = useLanguage();
  const session = useSession();
  const openFeedback = useOpenFeedback();
  const wide = useWideScreen();
  const [legalOpen, setLegalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signingOut, signOut } = useSignOut({
    onSignedOut: () => {
      openPlace("/");
    },
    onError: setError,
  });

  // What the rows say is set now. Each is loaded again when the page comes
  // back into view, as after adding a car; without an answer its row just
  // leaves the value out, and one that cannot be read again keeps what it
  // said.
  const { profileId } = me;
  const loadStanding = useCallback(
    () => session.call(publicProfileRoute, { params: { profileId } }),
    [session, profileId],
  );
  const loadReadiness = useCallback(() => session.call(driverReadinessRoute, {}), [session]);
  const loadCars = useCallback(() => session.call(listVehiclesRoute, {}), [session]);
  const loadSignIn = useCallback(() => session.call(listSignInMethodsRoute, {}), [session]);
  const { value: standing } = useLoadedOnFocus(loadStanding, answered);
  const { value: readiness } = useLoadedOnFocus(loadReadiness, answered);
  const { value: cars } = useLoadedOnFocus(loadCars, answered);
  const { value: signIn } = useLoadedOnFocus(loadSignIn, answered);

  const licence =
    readiness?.ok === true
      ? readiness.data.items.find((item) => item.item === "licence")?.done
      : undefined;
  const carNames =
    cars?.ok === true
      ? cars.data.vehicles
          .map(({ make, model }) => t("trip.carWithoutColour", { make, model }))
          .join(", ")
      : "";
  // The email signs in by a code sent to it; then what is linked or set up.
  const signInWays =
    signIn?.ok === true
      ? [
          me.email === null ? null : t("settings.email"),
          ...signIn.data.methods.map((method) => providerNames[method.provider]),
          (signIn.data.password ?? null) === null ? null : t("auth.password"),
          signIn.data.passkeys.length === 0 ? null : t("auth.passkey"),
        ]
          .filter((way) => way !== null)
          .join(", ")
      : "";

  const languages = languagesText(me, locale);
  const person = (
    <PersonCard
      firstName={me.firstName ?? ""}
      colour={peopleColourOf(me.id)}
      photo={me.photo?.url ?? null}
      lines={[
        ...(languages === "" ? [] : [t("profile.speaks", { languages })]),
        memberSinceText(t, locale, dayOf(new Date(me.memberSince))),
      ]}
      standing={standing === undefined ? "reading" : standing.ok ? standing.data : undefined}
      action={
        <Button
          variant="secondary"
          label={t("profile.editShort")}
          accessibilityLabel={t("profile.edit")}
          onPress={() => {
            router.push("/profile/edit");
          }}
        />
      }
    >
      {/* Each is as high as a finger needs, so nothing more is between them. */}
      <View>
        <PhotoControls me={me} align="start" />
        <TextLink label={t("profile.preview")} href="/profile/preview" align="start" />
      </View>
    </PersonCard>
  );
  const groups = (
    <>
      <Group title={t("profile.driving")}>
        <Row
          icon={Car}
          title={t("profile.myCars")}
          value={carNames === "" ? undefined : carNames}
          href="/drive/cars"
        />
        <Row
          icon={IdCard}
          title={t("driver.ready.licence")}
          value={
            licence === undefined
              ? undefined
              : t(licence ? "profile.licenceConfirmed" : "profile.licenceNotYet")
          }
          href="/drive/licence"
        />
      </Group>
      <Group
        title={t("profile.account")}
        under={me.phoneNumber === null ? undefined : t("profile.phoneHelp")}
      >
        <Row
          icon={Mail}
          title={t("settings.email")}
          value={
            me.pendingEmail !== null
              ? t("settings.emailWaiting", { email: me.pendingEmail })
              : (me.email ?? t("settings.signInMethods.noEmail"))
          }
          href="/settings/email"
        />
        {me.phoneNumber === null ? null : (
          <Row
            icon={Phone}
            title={t("profile.phone")}
            value={formatPhoneNumber(me.phoneNumber)}
            shows
          />
        )}
        <Row
          icon={KeyRound}
          title={t("settings.signInMethods")}
          value={signInWays === "" ? undefined : signInWays}
          href="/settings/sign-in-methods"
        />
        <Row icon={Bell} title={t("settings.notifications")} href="/settings/notifications" />
        <Row
          icon={Languages}
          title={t("settings.language")}
          value={t(locale === "en" ? "language.english" : "language.icelandic")}
          href="/settings/language"
        />
      </Group>
      <Group title={t("profile.safety")}>
        <Row icon={Lock} title={t("settings.privacy")} href="/settings/privacy" />
        <Row icon={Ban} title={t("blocks.title")} href="/settings/blocked" />
        <Row icon={Flag} title={t("reports.title")} href="/settings/reports" />
        <Row icon={BellRing} title={t("notices.title")} href="/notices" />
      </Group>
      <Group title={t("profile.help")}>
        <Row icon={MapPin} title={t("meetingPoints.title")} href="/meeting-points" />
        <Row icon={Megaphone} title={t("feedback.title")} onPress={openFeedback} />
        <ShakeRow />
        <Row icon={Inbox} title={t("feedback.mine")} href="/settings/feedback" />
        <Row icon={Info} title={t("about.title")} href="/about" />
        <Row
          icon={FileText}
          title={t("settings.legal")}
          expanded={legalOpen}
          onToggle={() => {
            setLegalOpen((open) => !open);
          }}
        >
          <View style={styles.documents}>
            {legalDocuments.map(({ title, href }) => (
              <TextLink key={href} label={t(title)} href={href} align="start" />
            ))}
          </View>
        </Row>
      </Group>
      <ActionRows>
        <Row
          icon={LogOut}
          title={t("settings.signOut")}
          disabled={signingOut !== null}
          onPress={() => void signOut(false)}
        />
      </ActionRows>
      <Notice message={error} />
    </>
  );
  // A wide screen (spec 31, 3.16 item 5): who I am in the side column, at
  // the left, which stays while the groups scroll in the main column.
  if (wide) {
    return (
      <Screen width="page">
        <ScreenHead title={t("profile.title")} back={null} />
        <Columns sideAt="start" side={person}>
          {groups}
        </Columns>
      </Screen>
    );
  }
  return (
    <Screen>
      <ScreenHead title={t("profile.title")} back={null} />
      {person}
      {groups}
    </Screen>
  );
}

/** Whether a call was answered: a row keeps what it said when it was not. */
const answered = (result: { readonly ok: boolean }) => result.ok;

/** The three documents, each on its own page; About holds them too (spec 30, 3.2). */
const legalDocuments = [
  { title: "legal.terms", href: "/legal/terms" },
  { title: "legal.rules", href: "/legal/community-rules" },
  { title: "legal.privacy", href: "/legal/privacy" },
] as const;

/**
 * A group of rows under its heading, with at most one small line `under`
 * it about one of its rows, as who can see the phone number.
 */
function Group({
  title,
  under,
  children,
}: {
  readonly title: string;
  readonly under?: string | undefined;
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  return (
    <View style={styles.group}>
      <Heading>{title}</Heading>
      <ActionRows>{children}</ActionRows>
      {under === undefined ? null : (
        <Text style={[typography.small, { color: palette.textMuted }]}>{under}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  links: { gap: spacing.sm, paddingTop: spacing.lg },
  group: { gap: spacing.sm },
  // The documents start under the row's words, past its icon.
  documents: { alignItems: "flex-start", paddingLeft: sizes.rowIcon + spacing.ms },
});
