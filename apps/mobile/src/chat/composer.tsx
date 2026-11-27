import {
  defaultChatSettings,
  lateMinutes,
  quickMessageKeys,
  type QuickMessage,
} from "@shareride/domain";
import { quickMessageText } from "@shareride/i18n";
import { Send } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Chip } from "@/components/chip";
import { IconButton } from "@/components/icon-button";
import { useWideScreen } from "@/components/screen";
import { useLanguage } from "@/i18n/language";
import { controlOutline, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { useGrowingField } from "./growing-field";
import type { Outgoing } from "./messages";

const { messageMaxLength } = defaultChatSettings;
/** The counter shows from here on (plan 4.3). */
const countFrom = messageMaxLength - 100;
/** Five lines, with the field's padding and outline; a longer message scrolls inside it. */
const fieldMaxHeight = 5 * typography.body.lineHeight + 2 * spacing.ms + 2 * controlOutline;
/**
 * The web starts a field of several lines with two; this one starts with
 * one and grows (`useGrowingField`). A phone's grows by itself, and on
 * Android `rows` would hold it at one line.
 */
const oneLineOnWeb = Platform.OS === "web" ? { rows: 1 } : {};

interface Sending {
  /**
   * Says whether what was written can be cleared: a conversation clears it
   * at once and keeps a failed message in the list; message all keeps it
   * until it went.
   */
  readonly onSend: (outgoing: Outgoing) => boolean | Promise<boolean>;
  readonly busy?: boolean;
}

/**
 * Quick messages and the field to write in (spec 7, 3.1, item 2), one
 * over the other, as the bar of "Message all passengers" has them. A
 * conversation has the two apart: the quick messages over its bar and the
 * field in it (spec 31, 3.13).
 */
export function Composer({ onSend, busy = false }: Sending) {
  return (
    <View style={styles.composer}>
      <QuickMessages onSend={onSend} busy={busy} />
      <MessageField onSend={onSend} busy={busy} />
    </View>
  );
}

/**
 * The quick messages, as chips (spec 7, 3.1, item 2; spec 31, 3.13, item
 * 3). "I'm running late" asks how many minutes first. What is being
 * written in the field stays as it is.
 */
export function QuickMessages({ onSend, busy = false }: Sending) {
  const { t } = useLanguage();
  const palette = usePalette();
  const [late, setLate] = useState(false);
  const sendQuick = (quick: QuickMessage) => {
    if (busy) return;
    setLate(false);
    void onSend({ quick });
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
    </View>
  );
}

/**
 * The field to write in (spec 31, 3.13, item 3): one line, with "Write a
 * message" in it until something is written, that grows with what is
 * written up to about five lines, and a round Send beside it, the screen's
 * main button. A screen that lays itself out anew, as a conversation does
 * when the window turns wide, keeps what is being written itself and
 * passes it as `draft`.
 */
export function MessageField({
  onSend,
  busy = false,
  draft,
}: Sending & {
  readonly draft?: readonly [text: string, setText: (text: string) => void];
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const own = useState("");
  const [text, setText] = draft ?? own;
  const [focused, setFocused] = useState(false);
  const field = useGrowingField(text);

  const sendText = async () => {
    const written = text.trim();
    if (written === "" || busy) return;
    if (await onSend({ text: written })) setText("");
  };

  return (
    <View style={styles.composer}>
      <View style={styles.row}>
        <TextInput
          ref={field}
          accessibilityLabel={t("chat.placeholder")}
          placeholder={t("chat.placeholder")}
          placeholderTextColor={palette.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          {...oneLineOnWeb}
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
        <IconButton
          filled
          icon={Send}
          label={t("chat.send")}
          busy={busy}
          onPress={() => {
            void sendText();
          }}
        />
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
  // Round at its ends while it has one line, as the button beside it is.
  field: {
    flex: 1,
    minHeight: sizes.inputHeight,
    maxHeight: fieldMaxHeight,
    borderWidth: controlOutline,
    borderRadius: sizes.inputHeight / 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.ms,
  },
});
