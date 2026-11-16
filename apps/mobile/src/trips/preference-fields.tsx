// The preferences and the note to passengers, as posting's seats step and
// Edit trip both ask for them (spec 3, 3.7; spec 6, 3.2).
import {
  chatOptions,
  checkNote,
  luggageOptions,
  noteMaxLength,
  petOptions,
  smokingOptions,
  type TripPreferences,
} from "@shareride/domain";
import type { MessageKey } from "@shareride/i18n";
import { StyleSheet, Text, View } from "react-native";
import { Chip } from "@/components/chip";
import { TextField } from "@/components/text-field";
import { useLanguage } from "@/i18n/language";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { chatKeys, childSeatKey, luggageKeys, petKeys, problemText, smokingKeys } from "./texts";

/** Each preference with its choices, one of each selected. */
export function PreferenceChoices({
  preferences,
  onChange,
}: {
  readonly preferences: TripPreferences;
  readonly onChange: (preferences: TripPreferences) => void;
}) {
  const { t } = useLanguage();
  const prefer = <K extends keyof TripPreferences>(key: K, value: TripPreferences[K]) => {
    onChange({ ...preferences, [key]: value });
  };
  return (
    <>
      <Choices
        label={t("trip.prefs.luggage")}
        options={luggageOptions}
        keys={luggageKeys}
        value={preferences.luggage}
        onChange={(value) => {
          prefer("luggage", value);
        }}
      />
      <Choices
        label={t("trip.prefs.pets")}
        options={petOptions}
        keys={petKeys}
        value={preferences.pets}
        onChange={(value) => {
          prefer("pets", value);
        }}
      />
      <Choices
        label={t("trip.prefs.smoking")}
        options={smokingOptions}
        keys={smokingKeys}
        value={preferences.smoking}
        onChange={(value) => {
          prefer("smoking", value);
        }}
      />
      <Choices
        label={t("trip.prefs.childSeat")}
        options={[false, true] as const}
        keys={{ false: childSeatKey(false), true: childSeatKey(true) }}
        value={preferences.childSeat}
        onChange={(value) => {
          prefer("childSeat", value);
        }}
      />
      <Choices
        label={t("trip.prefs.chat")}
        options={chatOptions}
        keys={chatKeys}
        value={preferences.chat}
        onChange={(value) => {
          prefer("chat", value);
        }}
      />
    </>
  );
}

/** The note to passengers, with what is wrong with it under it (R3.10). */
export function NoteField({
  note,
  onChange,
}: {
  readonly note: string;
  readonly onChange: (note: string) => void;
}) {
  const { t } = useLanguage();
  const problem = checkNote(note)[0];
  return (
    <TextField
      label={t("trip.note.label")}
      value={note}
      onChangeText={onChange}
      multiline
      maxLength={noteMaxLength * 2}
      help={t("trip.note.help", { max: noteMaxLength })}
      error={problem === undefined ? undefined : problemText(t, problem.code, "")}
    />
  );
}

/** One preference: its name and a chip for each choice, one of them selected. */
function Choices<T extends string | boolean>({
  label,
  options,
  keys,
  value,
  onChange,
}: {
  readonly label: string;
  readonly options: readonly T[];
  readonly keys: Readonly<Record<`${T}`, MessageKey>>;
  readonly value: T;
  readonly onChange: (value: T) => void;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  return (
    <View style={styles.choices}>
      <Text style={[typography.label, { color: palette.text }]}>{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.chips}>
        {options.map((option) => (
          <Chip
            key={String(option)}
            role="radio"
            label={t(keys[`${option}`])}
            selected={option === value}
            onToggle={() => {
              onChange(option);
            }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  choices: { gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
