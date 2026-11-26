import type { MyTrip } from "@shareride/contracts";
import type { Locale } from "@shareride/i18n";
import { useId, useState } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Notice } from "@/components/notice";
import { ShareNotice } from "@/components/share-notice";
import { Body, Heading } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { canCopy, canShareWindow, copyText, shareLink, type Shared } from "@/lib/share";
import { controlOutline, radii, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { tripWebAddress } from "@/trip-details/trip-link";
import { facebookShareAddress, puffinRideFacebookPage } from "./links";
import { postText } from "./post-text";

const languages: readonly {
  readonly locale: Locale;
  readonly label: "language.icelandic" | "language.english";
}[] = [
  { locale: "is", label: "language.icelandic" },
  { locale: "en", label: "language.english" },
];

/**
 * Share this ride (spec 28, 3.2): the driver's published trip, from its
 * first stop to its last, into the phone's share window where there is one,
 * Facebook's share window, or a post of its own with the text to copy, in
 * Icelandic or English; and PuffinRide's Facebook Page to follow. Nothing
 * posts for the driver (R28.1), and nothing loads from Facebook before a
 * tap (R28.3). `heading` is left out on the screen whose title says it.
 */
export function ShareRidePanel({
  trip,
  heading = true,
}: {
  readonly trip: MyTrip;
  readonly heading?: boolean;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const textLabel = useId();
  // The app's language until the driver picks one for the post.
  const [picked, setPicked] = useState<Locale | null>(null);
  const language = picked ?? locale;
  const [shared, setShared] = useState<Shared | null>(null);
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
  const url = tripWebAddress(trip.id, { board: 0, alight: trip.stops.length - 1 });
  const post = postText(trip, language, url);

  const share = async () => {
    setShared({ outcome: await shareLink(url, post.withoutLink, post.title), url });
  };
  const open = (address: string) => {
    setShared(null);
    // Should the browser or the phone not open it, the link is there to copy.
    Linking.openURL(address).catch(() => {
      setShared({ outcome: "failed", url });
    });
  };
  const copy = async () => {
    setCopied(await copyText(post.text));
  };

  return (
    <Card>
      {heading ? <Heading>{t("shareRide.heading")}</Heading> : null}
      <Body align="start">{t("shareRide.intro")}</Body>
      {canShareWindow() ? (
        <Button
          variant="secondary"
          label={t("shareRide.share")}
          onPress={() => {
            void share();
          }}
        />
      ) : null}
      <Button
        variant="secondary"
        label={t("shareRide.facebook")}
        onPress={() => {
          open(facebookShareAddress(url));
        }}
      />
      <Body align="start">{t("shareRide.facebookHint")}</Body>
      <ShareNotice shared={shared} />

      <View style={styles.textHead}>
        <Text nativeID={textLabel} style={[typography.label, { color: palette.text }]}>
          {t("shareRide.postText")}
        </Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t("shareRide.postLanguage")}
          style={styles.chips}
        >
          {languages.map((choice) => (
            <Chip
              key={choice.locale}
              role="radio"
              lang={choice.locale}
              label={t(choice.label)}
              selected={choice.locale === language}
              onToggle={() => {
                setPicked(choice.locale);
                setCopied(null);
              }}
            />
          ))}
        </View>
      </View>
      <View
        aria-labelledby={textLabel}
        style={[styles.text, { borderColor: palette.border, backgroundColor: palette.background }]}
      >
        <Text
          selectable
          accessibilityLanguage={language}
          // react-native-web reads lang; React Native's types do not know it.
          {...(Platform.OS === "web" ? { lang: language } : {})}
          style={[typography.body, { color: palette.text }]}
        >
          {post.text}
        </Text>
      </View>
      {canCopy() ? (
        <Button
          variant="secondary"
          label={t("shareRide.copyText")}
          onPress={() => {
            void copy();
          }}
        />
      ) : null}
      {copied === "copied" ? <Notice kind="info" message={t("shareRide.textCopied")} /> : null}
      {copied === "failed" ? <Notice message={t("shareRide.copyFailed")} /> : null}

      <TextLink
        label={t("shareRide.follow")}
        onPress={() => {
          open(puffinRideFacebookPage);
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  textHead: { gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  text: { borderWidth: controlOutline, borderRadius: radii.control, padding: spacing.md },
});
