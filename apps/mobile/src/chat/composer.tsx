import {
  defaultChatSettings,
  lateMinutes,
  quickMessageKeys,
  type QuickMessage,
} from "@shareride/domain";
import { quickMessageText } from "@shareride/i18n";
import { useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { useWideScreen } from "@/components/screen";
import { useLanguage } from "@/i18n/language";
import { controlOutline, radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import type { Outgoing } from "./messages";

const { messageMaxLength } = defaultChatSettings;
/** The counter shows from here on (plan 4.3). */
const countFrom = messageMaxLength - 100;
/** About five lines; a longer message scrolls inside the field. */
const fieldMaxHeight = 5 * typography.body.lineHeight + 2 * spacing.ms;

/**
 * Quick messages and the field to write in (spec 7, 3.1, item 2), for one
 * conversation or for all passengers. "I'm running late" asks how many
 * minutes first. `onSend` says whether what was written can be cleared: a
 * conversation clears it at once and keeps a failed message in the list;
 * message all keeps it until it went.
 */
export function Composer({
  onSend,
  busy = false,
}: {
  readonly onSend: (outgoing: Outgoing) => boolean | Promise<boolean>;
  readonly busy?: boolean;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const [text, setText] = useState("");
  const [late, setLate] = useState(false);
  const [focused, setFocused] = useState(false);

  const send = async (outgoing: Outgoing) => {
    if (await onSend(outgoing)) {
      if ("text" in outgoing) setText("");
    }
  };
  const sendQuick = (quick: QuickMessage) => {
    if (busy) return;
    setLate(false);
    void send({ quick });
  };
  const sendText = () => {
    const written = text.trim();
    if (written === "" || busy) return;
    void send({ text: written });
  };

  return (
    <View style={styles.composer}>
      {late ? (
        <Text style={[typography.label, { color: palette.text }]}>{t("chat.lateHowMuch")}</Text>
      ) : null}
      <Chips label={t("chat.quickMessages")}>
        <Chip
          role="button"
          label={t("chat.late")}
          selected={late}
          onToggle={() => {
            setLate((open) => !open);
          }}
        />
        {late
          ? lateMinutes.map((minutes) => (
              <Chip
                key={minutes}
                role="button"
                label={t("format.minutes", { minutes })}
                selected={false}
                onToggle={() => {
                  sendQuick({ key: "late", minutes });
                }}
              />
            ))
          : quickMessageKeys
              .filter((key) => key !== "late")
              .map((key) => {
                const quick = { key } as QuickMessage;
                return (
                  <Chip
                    key={key}
                    role="button"
                    label={quickMessageText(t, quick)}
                    selected={false}
                    onToggle={() => {
                      sendQuick(quick);
                    }}
                  />
                );
              })}
      </Chips>
      <Text style={[typography.label, { color: palette.text }]}>{t("chat.placeholder")}</Text>
      <View style={styles.row}>
        <TextInput
          accessibilityLabel={t("chat.placeholder")}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={messageMaxLength}
          onFocus={() => {
            setFocused(true);
          }}
          onBlur={() => {
            setFocused(false);
          }}
          style={[
            typography.body,
            styles.field,
            {
              color: palette.text,
              backgroundColor: palette.surface,
              borderColor: focused ? palette.primary : palette.control,
            },
          ]}
        />
        <Button label={t("chat.send")} busy={busy} onPress={sendText} />
      </View>
      {text.length >= countFrom ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[typography.small, { color: palette.textMuted }]}
        >
          {t("booking.messageCount", { count: text.length, max: messageMaxLength })}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The quick messages in one row that scrolls sideways on a phone, so the
 * field stays in view; on a wide screen, where a mouse cannot easily scroll
 * sideways, they wrap.
 */
function Chips({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  if (useWideScreen()) {
    return (
      <View accessibilityLabel={label} style={[styles.chips, styles.wrap]}>
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      accessibilityLabel={label}
      contentContainerStyle={styles.chips}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  composer: { gap: spacing.sm },
  chips: { gap: spacing.sm, paddingVertical: spacing.xs },
  wrap: { flexDirection: "row", flexWrap: "wrap" },
  row: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  field: {
    flex: 1,
    minHeight: sizes.inputHeight,
    maxHeight: fieldMaxHeight,
    borderWidth: controlOutline,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.ms,
  },
});
