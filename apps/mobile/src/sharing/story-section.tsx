import type { MyTrip } from "@shareride/contracts";
import type { Locale } from "@shareride/i18n";
import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { apiBaseUrl } from "@/auth/api";
import { Announcer } from "@/components/announcer";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { ShareNotice } from "@/components/share-notice";
import { Body, Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import {
  canCopy,
  copyText,
  fetchPicture,
  forgetPictureAddress,
  pictureAddress,
  pictureSharing,
  savePicture,
  sharePicture,
  type Shared,
} from "@/lib/share";
import { controlOutline, radii, sizes, spacing } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/** The file's name when the API's answer does not name it. */
const fileName = "puffinride.png";

/** A story fetched for an address and a try: its file, or null when it could not be. */
interface Fetched {
  readonly story: string;
  readonly attempt: number;
  readonly file: File | null;
  /** Where the page shows it from, while it is shown. */
  readonly address: string | null;
}

/**
 * Story on Instagram (spec 28, 3.2 item 5 and 3.5), on the web: the ride's
 * story picture, drawn by the API in the post's `language` and fetched
 * once as the section shows, since a browser opens the share window only
 * straight after a tap. The same picture is shown small, shared with Share
 * picture where the browser can share a file, and saved with Download
 * picture in every browser; Copy link is for the link sticker. When it
 * cannot be fetched, the section says so and tries again on a tap. The
 * apps leave it out until they can share a file.
 */
export function StorySection({
  trip,
  link,
  language,
  headingLevel = 2,
}: {
  readonly trip: MyTrip;
  /** The trip's link, for the sticker. */
  readonly link: string;
  readonly language: Locale;
  /** 3 under the panel's own heading. */
  readonly headingLevel?: 2 | 3;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const sharing = pictureSharing();
  const story =
    `${apiBaseUrl()}/v1/trips/${trip.id}/story.png` +
    `?fromStop=0&toStop=${String(trip.stops.length - 1)}&lang=${language}&download=1`;
  const [attempt, setAttempt] = useState(0);
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [notShared, setNotShared] = useState(false);
  const [shared, setShared] = useState<Shared | null>(null);
  // Each copy, read out even when the words are the same as the last one's.
  const [said, setSaid] = useState<{ readonly text: string; readonly count: number } | null>(null);
  // The browser refuses a second share while its window is open.
  const sharingNow = useRef(false);

  useEffect(() => {
    if (sharing === "none") return;
    const controller = new AbortController();
    void fetchPicture(story, fileName, controller.signal).then((file) => {
      if (controller.signal.aborted) return;
      setFetched({ story, attempt, file, address: file === null ? null : pictureAddress(file) });
    });
    return () => {
      controller.abort();
    };
  }, [sharing, story, attempt]);
  // The page forgets a picture's address once another replaces it, or the section goes.
  const address = fetched?.address ?? null;
  useEffect(
    () => () => {
      if (address !== null) forgetPictureAddress(address);
    },
    [address],
  );

  if (sharing === "none") return null;
  const current = fetched?.story === story && fetched.attempt === attempt ? fetched : undefined;
  // Undefined while this language's picture is being fetched.
  const file = current?.file;
  const share = async (picture: File) => {
    if (sharingNow.current) return;
    sharingNow.current = true;
    setNotShared(false);
    const outcome = await sharePicture(picture);
    sharingNow.current = false;
    if (outcome === "failed") setNotShared(true);
  };
  const copy = async () => {
    const outcome = await copyText(link);
    setShared({ outcome, url: link });
    const text = outcome === "copied" ? t("trip.linkCopied") : t("trip.shareFailed", { url: link });
    setSaid((last) => ({ text, count: (last?.count ?? 0) + 1 }));
  };

  return (
    <>
      <Heading level={headingLevel}>{t("shareRide.story")}</Heading>
      <View style={styles.row}>
        <View style={[styles.picture, { borderColor: palette.border }]}>
          {current === undefined || current.address === null ? null : (
            <Image source={{ uri: current.address }} accessible={false} style={styles.fill} />
          )}
        </View>
        <View style={styles.hint}>
          <Body align="start">{t("shareRide.storyHint")}</Body>
        </View>
      </View>
      {file === null ? (
        <>
          <Notice message={t("shareRide.pictureFailed")} />
          <Button
            variant="secondary"
            label={t("common.retry")}
            onPress={() => {
              setAttempt((last) => last + 1);
            }}
          />
        </>
      ) : (
        <>
          {sharing === "share" ? (
            <Button
              variant="secondary"
              label={t("shareRide.sharePicture")}
              busy={file === undefined}
              onPress={() => {
                if (file !== undefined) void share(file);
              }}
            />
          ) : null}
          <Button
            variant={sharing === "share" ? "text" : "secondary"}
            label={t("shareRide.downloadPicture")}
            busy={file === undefined}
            onPress={() => {
              if (file !== undefined) savePicture(file);
            }}
          />
          {notShared ? <Notice message={t("shareRide.pictureNotShared")} /> : null}
        </>
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
    overflow: "hidden",
  },
  fill: { width: "100%", height: "100%" },
  hint: { flex: 1 },
});
