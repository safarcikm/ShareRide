import { deleteMyPhotoRoute, putMyPhotoRoute, type Me } from "@shareride/contracts";
import { profilePhotoLimits } from "@shareride/domain";
import type { CallResult } from "@shareride/api-client";
import { Camera, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSession } from "@/auth/session";
import { errorText } from "@/auth/errors";
import { ActionRows } from "@/components/action-rows";
import { Button } from "@/components/button";
import { ActionNotice, Notice } from "@/components/notice";
import { Row } from "@/components/row";
import { InBar } from "@/components/screen";
import { useLanguage } from "@/i18n/language";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { choosePhoto, type ChosenPhoto, type PhotoSource } from "./photo-picker";

type Busy = PhotoSource | "remove" | null;

/**
 * Adding, changing and removing my profile photo (spec 1, 3.5): from my
 * photos, or the camera on a phone. They stand in the person's card on
 * Profile and on Edit profile, and under it on the page that asks for a
 * photo before a ride is published (spec 31, 3.14 and 3.19). There,
 * `prominent`, adding or changing the photo is the screen's one main
 * button, in its bottom bar, with why it did not work over it; the camera
 * and removing are rows with pictures, removing red and last (R31.1 and
 * R31.3). They start at the left, as everything around them does. While
 * PuffinRide hides the photo (spec 9, 3.4.3) only I see it, with a note
 * why.
 */
export function PhotoControls({
  me,
  onAdded,
  prominent = false,
}: {
  readonly me: Me;
  /** After a photo is added or changed, in place of saying so here. */
  readonly onAdded?: () => void;
  /** Adding a photo is the screen's main button, in its bar, not a link in the card. */
  readonly prominent?: boolean;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const [busy, setBusy] = useState<Busy>(null);
  // Why a press did nothing, and which press, so it is said where that
  // press was.
  const [error, setError] = useState<{
    readonly of: Exclude<Busy, null>;
    readonly message: string;
  } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const failedTo = (of: Exclude<Busy, null>, message: string | null) => {
    setError(message === null ? null : { of, message });
  };

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
        failedTo(source, refusal(chosen));
        return;
      }
      const result = await session.call(putMyPhotoRoute, { body: { photo: chosen.photo } });
      if (!result.ok) failedTo(source, failed(result));
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
      else failedTo("remove", errorText(t, result));
    } finally {
      setBusy(null);
    }
  };

  const hasPhoto = me.photo !== null;
  const camera = Platform.OS !== "web";
  const hidden =
    me.photo?.hidden === true ? (
      <Notice kind="info" urgent={false} message={t("profile.photo.hidden")} />
    ) : null;
  const help = hasPhoto ? null : (
    <Text style={[typography.small, { color: palette.textMuted }]}>{t("profile.photo.help")}</Text>
  );
  const mainLabel = t(hasPhoto ? "profile.photo.change" : "profile.photo.add");
  const fromMyPhotos = () => {
    void add("library");
  };
  const fromCamera = () => {
    void add("camera");
  };
  const removeIt = () => {
    void remove();
  };

  if (prominent) {
    const ofMain = error?.of === "library" ? error.message : null;
    return (
      <View style={styles.page}>
        {hidden}
        {help}
        {camera || hasPhoto ? (
          <ActionRows>
            {camera ? (
              <Row
                icon={Camera}
                title={t("profile.photo.take")}
                busy={busy === "camera"}
                disabled={busy !== null}
                onPress={fromCamera}
              />
            ) : null}
            {hasPhoto ? (
              <Row
                danger
                icon={Trash2}
                title={t("profile.photo.remove")}
                busy={busy === "remove"}
                disabled={busy !== null}
                onPress={removeIt}
              />
            ) : null}
          </ActionRows>
        ) : null}
        <Notice message={error === null || error.of === "library" ? null : error.message} />
        <Notice kind="info" urgent={false} message={done} />
        <InBar>
          <ActionNotice says={ofMain} />
          <Button
            main
            label={mainLabel}
            busy={busy === "library"}
            disabled={busy !== null}
            onPress={fromMyPhotos}
          />
        </InBar>
      </View>
    );
  }

  return (
    <View style={styles.controls}>
      {hidden}
      <View style={styles.buttons}>
        <Button
          variant="text"
          label={mainLabel}
          busy={busy === "library"}
          disabled={busy !== null}
          onPress={fromMyPhotos}
        />
        {camera ? (
          <Button
            variant="text"
            label={t("profile.photo.take")}
            busy={busy === "camera"}
            disabled={busy !== null}
            onPress={fromCamera}
          />
        ) : null}
        {hasPhoto ? (
          <Button
            variant="text"
            label={t("profile.photo.remove")}
            busy={busy === "remove"}
            disabled={busy !== null}
            onPress={removeIt}
          />
        ) : null}
      </View>
      {help}
      <Notice message={error?.message ?? null} />
      <Notice kind="info" urgent={false} message={done} />
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { gap: spacing.xs, alignItems: "stretch" },
  // The first button's words start where the card's other lines do.
  buttons: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    columnGap: spacing.md,
    marginLeft: -spacing.sm,
  },
  // On the page that asks for a photo: the rows, and what they say.
  page: { gap: spacing.md },
});
