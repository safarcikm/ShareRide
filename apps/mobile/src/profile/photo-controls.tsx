import { deleteMyPhotoRoute, putMyPhotoRoute, type Me } from "@shareride/contracts";
import { profilePhotoLimits } from "@shareride/domain";
import type { CallResult } from "@shareride/api-client";
import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSession } from "@/auth/session";
import { errorText } from "@/auth/errors";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { useLanguage } from "@/i18n/language";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { choosePhoto, type ChosenPhoto, type PhotoSource } from "./photo-picker";

type Busy = PhotoSource | "remove" | null;

/**
 * Adding, changing and removing my profile photo, under my avatar on
 * Profile and before publishing a trip (spec 1, 3.5): from my photos, or
 * the camera on a phone. While ShareRide hides it (spec 9, 3.4.3) only I
 * see it, with a note why.
 */
export function PhotoControls({
  me,
  onAdded,
  prominent = false,
}: {
  readonly me: Me;
  /** After a photo is added or changed, in place of saying so here. */
  readonly onAdded?: () => void;
  /** Adding a photo is the screen's main action, not a link under the avatar. */
  readonly prominent?: boolean;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const refusal = (chosen: Exclude<ChosenPhoto, { kind: "chosen" }>) => {
    switch (chosen.kind) {
      case "cancelled":
        return null;
      case "no_camera":
        return t("profile.photo.noCamera");
      case "too_small":
        return t("profile.photo.tooSmall", { min: profilePhotoLimits.minEdge });
      case "unusable":
        return t("profile.photo.unusable");
    }
  };

  const failed = (result: CallResult<typeof putMyPhotoRoute>) => {
    if (result.ok) return null;
    switch (result.error.code) {
      case "photo_storage_off":
        return t("profile.photo.off");
      case "photo_storage_unavailable":
        return t("profile.photo.failed");
      case "validation_failed":
        return t("profile.photo.unusable");
      default:
        return errorText(t, result);
    }
  };

  const saved = (next: Me, text: string) => {
    session.update(next);
    setDone(text);
  };

  const add = async (source: PhotoSource) => {
    setBusy(source);
    setError(null);
    setDone(null);
    try {
      const chosen = await choosePhoto(source);
      if (chosen.kind !== "chosen") {
        setError(refusal(chosen));
        return;
      }
      const result = await session.call(putMyPhotoRoute, { body: { photo: chosen.photo } });
      if (!result.ok) setError(failed(result));
      else if (onAdded === undefined) saved(result.data, t("profile.photo.saved"));
      else {
        session.update(result.data);
        onAdded();
      }
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("remove");
    setError(null);
    setDone(null);
    try {
      const result = await session.call(deleteMyPhotoRoute, {});
      if (result.ok) saved(result.data, t("profile.photo.removed"));
      else setError(errorText(t, result));
    } finally {
      setBusy(null);
    }
  };

  const hasPhoto = me.photo !== null;
  return (
    <View style={styles.controls}>
      {me.photo?.hidden === true ? (
        <Notice kind="info" urgent={false} message={t("profile.photo.hidden")} />
      ) : null}
      <View style={prominent ? styles.stacked : styles.buttons}>
        <Button
          main={prominent}
          variant={prominent ? "primary" : "text"}
          label={t(hasPhoto ? "profile.photo.change" : "profile.photo.add")}
          busy={busy === "library"}
          disabled={busy !== null}
          onPress={() => {
            void add("library");
          }}
        />
        {Platform.OS === "web" ? null : (
          <Button
            variant={prominent ? "secondary" : "text"}
            label={t("profile.photo.take")}
            busy={busy === "camera"}
            disabled={busy !== null}
            onPress={() => {
              void add("camera");
            }}
          />
        )}
        {hasPhoto ? (
          <Button
            variant="text"
            label={t("profile.photo.remove")}
            busy={busy === "remove"}
            disabled={busy !== null}
            onPress={() => {
              void remove();
            }}
          />
        ) : null}
      </View>
      {hasPhoto ? null : (
        <Text style={[typography.small, styles.centre, { color: palette.textMuted }]}>
          {t("profile.photo.help")}
        </Text>
      )}
      <Notice message={error} />
      <Notice kind="info" urgent={false} message={done} />
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { gap: spacing.xs, alignItems: "stretch" },
  buttons: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    columnGap: spacing.md,
  },
  stacked: { gap: spacing.sm },
  centre: { textAlign: "center" },
});
