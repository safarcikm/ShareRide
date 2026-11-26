import type { MyTrip } from "@shareride/contracts";
import type { Locale } from "@shareride/i18n";
import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { apiBaseUrl } from "@/auth/api";
import { Announcer } from "@/components/announcer";
import { Button } from "@/components/button";
import { ShareNotice } from "@/components/share-notice";
import { Body, Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import {
  canCopy,
  copyText,
  fetchPicture,
  pictureSharing,
  sharePicture,
  type Shared,
} from "@/lib/share";
import { openDownload } from "@/privacy/open-download";
import { controlOutline, radii, sizes, spacing } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/** The name a shared story's file has; a saved one is named after its route by the API. */
const fileName = "puffinride.png";

/**
 * Story on Instagram (spec 28, 3.2 item 5 and 3.5), on the web: the ride's
 * story picture, drawn by the API in the post's `language`, small; Share
 * picture where the browser can share a file (fetched as the section
 * shows, since a browser opens the share window only straight after a
 * tap), otherwise Download picture; and Copy link for the link sticker.
 * The apps leave it out until they can share a file.
 */
export function StorySection({
  trip,
  link,
  language,
}: {
  readonly trip: MyTrip;
  /** The trip's link, for the sticker. */
  readonly link: string;
  readonly language: Locale;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const sharing = pictureSharing();
  const story =
    `${apiBaseUrl()}/v1/trips/${trip.id}/story.png` +
    `?fromStop=0&toStop=${String(trip.stops.length - 1)}&lang=${language}`;
  // The picture fetched for an address; null when it could not be.
  const [fetched, setFetched] = useState<{
    readonly story: string;
    readonly file: File | null;
  } | null>(null);
  // Undefined while this language's picture is being fetched.
  const file = fetched?.story === story ? fetched.file : undefined;
  const [shared, setShared] = useState<Shared | null>(null);
  // Each copy, read out even when the words are the same as the last one's.
  const [said, setSaid] = useState<{ readonly text: string; readonly count: number } | null>(null);
  // The browser refuses a second share while its window is open.
  const sharingNow = useRef(false);
  useEffect(() => {
    if (sharing !== "share") return;
    let current = true;
    void fetchPicture(story, fileName).then((picture) => {
      if (current) setFetched({ story, file: picture });
    });
    return () => {
      current = false;
    };
  }, [sharing, story]);

  if (sharing === "none") return null;
  const share = async (picture: File) => {
    if (sharingNow.current) return;
    sharingNow.current = true;
    const outcome = await sharePicture(picture);
    sharingNow.current = false;
    // A picture that could not be shared can still be saved.
    if (outcome === "failed") setFetched({ story, file: null });
  };
  const copy = async () => {
    const outcome = await copyText(link);
    setShared({ outcome, url: link });
    const text = outcome === "copied" ? t("trip.linkCopied") : t("trip.shareFailed", { url: link });
    setSaid((last) => ({ text, count: (last?.count ?? 0) + 1 }));
  };

  return (
    <>
      <Heading>{t("shareRide.story")}</Heading>
      <View style={styles.row}>
        <Image
          source={{ uri: story }}
          accessible={false}
          style={[styles.picture, { borderColor: palette.border }]}
        />
        <View style={styles.hint}>
          <Body align="start">{t("shareRide.storyHint")}</Body>
        </View>
      </View>
      {sharing === "share" && file !== null ? (
        <Button
          variant="secondary"
          label={t("shareRide.sharePicture")}
          busy={file === undefined}
          onPress={() => {
            if (file !== undefined) void share(file);
          }}
        />
      ) : (
        <Button
          variant="secondary"
          label={t("shareRide.downloadPicture")}
          onPress={() => {
            void openDownload(`${story}&download=1`);
          }}
        />
      )}
      {canCopy() ? (
        <Button
          variant="secondary"
          label={t("shareRide.copyLink")}
          onPress={() => {
            void copy();
          }}
        />
      ) : null}
      <ShareNotice shared={shared} />
      <Announcer message={said} />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  picture: {
    width: sizes.storyPreview,
    height: (sizes.storyPreview * 16) / 9,
    borderRadius: radii.control,
    borderWidth: controlOutline,
  },
  hint: { flex: 1 },
});
