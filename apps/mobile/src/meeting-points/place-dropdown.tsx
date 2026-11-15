import type { PlaceSearchResult } from "@shareride/contracts";
import { X } from "lucide-react-native";
import { useEffect, useRef, type ComponentRef, type ReactNode } from "react";
import {
  AccessibilityInfo,
  BackHandler,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { IconButton } from "@/components/icon-button";
import { Notice } from "@/components/notice";
import { useScreenScroll } from "@/components/screen";
import { useLanguage } from "@/i18n/language";
import { controlOutline, radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { maximumQueryLength, PlaceResults, usePlaceQuery } from "./place-search";

/**
 * The place search of spec 2, 3.4 as a dropdown, for From and To (spec 3,
 * 3.4.1; spec 4, 3.1): a field in place of the end being chosen, and what
 * it finds listed right under it, on the same screen. Choosing a result,
 * Close, Escape and Android's back close it. On phones it scrolls up to the
 * top of the screen as it opens, so the keyboard does not hide the list.
 */
export function PlaceDropdown({
  label,
  placeholder,
  onChoose,
  onClose,
  onType,
  whenIdle,
  message,
  instead,
}: {
  /** The field's name, as shown above it: "From" or "To". */
  readonly label: string;
  readonly placeholder: string;
  readonly onChoose: (result: PlaceSearchResult) => void;
  readonly onClose: () => void;
  /** Told when the text changes. */
  readonly onType?: () => void;
  /** Listed until two characters are typed. */
  readonly whenIdle?: ReactNode;
  /** Shown above the list, such as why a choice can't be made. */
  readonly message?: string | null;
  /** Listed in place of the results, such as the meeting points near a town. */
  readonly instead?: ReactNode;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const search = usePlaceQuery();
  const dropdown = useRef<ComponentRef<typeof View>>(null);
  const field = useRef<ComponentRef<typeof TextInput>>(null);

  // Opening: up above the keyboard, and screen readers on phones move to the
  // field (autoFocus moves only the keyboard's focus there).
  const screenScroll = useScreenScroll();
  useEffect(() => screenScroll?.reveal(dropdown), [screenScroll]);
  useEffect(() => {
    if (Platform.OS !== "web" && field.current !== null) {
      AccessibilityInfo.sendAccessibilityEvent(field.current, "focus");
    }
  }, []);

  // Android's back closes the list, as it would a screen, rather than
  // leaving the screen under it (or the app, on the front page).
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => {
      subscription.remove();
    };
  }, [onClose]);

  const list =
    instead ??
    (search.idle ? whenIdle : <PlaceResults search={search} onChoose={onChoose} compact />);
  const shown = (message ?? null) !== null || (list !== undefined && list !== null);
  return (
    <View ref={dropdown} style={styles.dropdown} {...escapeOnWeb(onClose)}>
      <View style={styles.field}>
        <TextInput
          ref={field}
          accessibilityLabel={label}
          autoFocus
          value={search.text}
          onChangeText={(value) => {
            search.setText(value);
            onType?.();
          }}
          onKeyPress={(event) => {
            if (event.nativeEvent.key === "Escape") onClose();
          }}
          placeholder={placeholder}
          placeholderTextColor={palette.textMuted}
          maxLength={maximumQueryLength}
          autoCapitalize="words"
          autoCorrect={false}
          style={[
            typography.body,
            styles.input,
            { color: palette.text, borderColor: palette.primary, backgroundColor: palette.surface },
          ]}
        />
        <IconButton icon={X} label={t("common.close")} onPress={onClose} />
      </View>
      {shown ? (
        <View style={[styles.list, { borderColor: palette.border }]}>
          <Notice message={message ?? null} />
          {list}
        </View>
      ) : null}
    </View>
  );
}

/**
 * On the web, Escape closes the dropdown wherever focus is in it, such as on
 * Close or a result; the field handles its own Escape, as the web's text
 * field keeps its keys to itself.
 */
function escapeOnWeb(onClose: () => void): object {
  if (Platform.OS !== "web") return {};
  return {
    onKeyDown: (event: { key: string }) => {
      if (event.key === "Escape") onClose();
    },
  };
}

const styles = StyleSheet.create({
  dropdown: { gap: spacing.sm },
  field: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: sizes.inputHeight,
    borderWidth: controlOutline,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.ms,
  },
  list: {
    gap: spacing.xs,
    padding: spacing.xs,
    borderWidth: controlOutline,
    borderRadius: radii.control,
  },
});
