import type { MeetingPointPhoto } from "@shareride/contracts";
import { useState } from "react";
import { Image, Platform, StyleSheet, View } from "react-native";
import { apiBaseUrl } from "@/auth/api";
import { Notice } from "@/components/notice";
import { useLanguage } from "@/i18n/language";
import { radii, spacing } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { photoUrl } from "./photo-url";

/** On the web a label counts only on an element with a role. */
const imageRole: object = Platform.OS === "web" ? { role: "img" } : {};

/**
 * A meeting point's photos, in the operator's order, each the full width of
 * the column in its own shape, described for screen readers in the user's
 * language (spec 2, 3.2). Nothing where the point has none.
 */
export function MeetingPointPhotos({ photos }: { readonly photos: readonly MeetingPointPhoto[] }) {
  if (photos.length === 0) return null;
  const apiBase = apiBaseUrl();
  return (
    <View style={styles.photos}>
      {photos.map((photo) => (
        <Photo key={photo.url} photo={photo} apiBase={apiBase} />
      ))}
    </View>
  );
}

function Photo({
  photo,
  apiBase,
}: {
  readonly photo: MeetingPointPhoto;
  readonly apiBase: string;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const [failed, setFailed] = useState(false);
  const description = photo.description[locale];
  if (failed) {
    // Offline, or a link that ran out: what the photo shows still helps.
    return <Notice kind="info" message={t("meetingPoints.photoFailed", { description })} />;
  }
  return (
    <Image
      testID="meeting-point-photo"
      accessible
      accessibilityRole="image"
      accessibilityLabel={description}
      {...imageRole}
      source={{ uri: photoUrl(photo.url, apiBase) }}
      onError={() => {
        setFailed(true);
      }}
      style={[
        styles.photo,
        { aspectRatio: photo.width / photo.height, backgroundColor: palette.surface },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  photos: { gap: spacing.md },
  photo: { width: "100%", borderRadius: radii.card },
});
