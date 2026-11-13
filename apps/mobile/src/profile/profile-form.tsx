import { updateMeRoute, type Me } from "@shareride/contracts";
import {
  profileRules,
  spokenLanguages,
  validateProfileChanges,
  type ProfileError,
} from "@shareride/domain";
import { languageNames, type MessageKey, type Translate } from "@shareride/i18n";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { Notice } from "@/components/notice";
import { TextField } from "@/components/text-field";
import { useLanguage } from "@/i18n/language";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

const fieldErrors: Record<ProfileError["field"], MessageKey> = {
  firstName: "error.firstName",
  about: "error.about",
  languages: "error.languages",
};

function fieldError(t: Translate, field: ProfileError["field"]): string {
  const max = field === "firstName" ? profileRules.firstNameMaxLength : profileRules.aboutMaxLength;
  return t(fieldErrors[field], { max });
}

const knownLanguages = new Set<string>(spokenLanguages);

/**
 * First name, about and spoken languages (spec 1, section 3.5), checked with
 * the same rules as the API before saving. Photo and email come later.
 */
export function ProfileForm({
  me,
  onSaved,
}: {
  readonly me: Me;
  /** After saving; the account in the session is already updated. */
  readonly onSaved?: (me: Me) => void;
}) {
  const { locale, t } = useLanguage();
  const session = useSession();
  const palette = usePalette();
  const [firstName, setFirstName] = useState(me.firstName ?? "");
  const [about, setAbout] = useState(me.about ?? "");
  // A language a newer version added is kept off the form rather than refused.
  const [languages, setLanguages] = useState<readonly string[]>(() =>
    me.languages.filter((language) => knownLanguages.has(language)),
  );
  const [errors, setErrors] = useState<Partial<Record<ProfileError["field"], string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);

  function toggle(language: string) {
    setErrors(({ languages: _cleared, ...others }) => others);
    setLanguages((chosen) =>
      chosen.includes(language) ? chosen.filter((l) => l !== language) : [...chosen, language],
    );
  }

  async function save() {
    if (saving.current) return;
    setError(null);
    const valid = validateProfileChanges({ firstName, about, languages });
    if (!valid.ok) {
      setErrors({ [valid.error.field]: fieldError(t, valid.error.field) });
      return;
    }
    saving.current = true;
    setBusy(true);
    const result = await session.call(updateMeRoute, {
      body: {
        firstName: valid.value.firstName,
        about: valid.value.about ?? "",
        languages: [...(valid.value.languages ?? [])],
      },
    });
    saving.current = false;
    setBusy(false);
    if (result.ok) {
      session.update(result.data);
      onSaved?.(result.data);
      return;
    }
    const field = (result.error.details as { field?: ProfileError["field"] } | undefined)?.field;
    if (result.error.code === "profile_invalid" && field !== undefined) {
      setErrors({ [field]: fieldError(t, field) });
    } else {
      setError(errorText(t, result));
    }
  }

  return (
    <View style={styles.form}>
      <TextField
        label={t("profile.firstName")}
        help={t("profile.firstNameHelp")}
        error={errors.firstName}
        value={firstName}
        onChangeText={(value) => {
          setFirstName(value);
          setErrors(({ firstName: _cleared, ...others }) => others);
        }}
        autoComplete="given-name"
        textContentType="givenName"
        autoCapitalize="words"
        maxLength={60}
      />
      <View style={styles.about}>
        <TextField
          label={t("profile.about")}
          help={t("profile.aboutHelp", { max: profileRules.aboutMaxLength })}
          error={errors.about}
          value={about}
          onChangeText={(value) => {
            setAbout(value);
            setErrors(({ about: _cleared, ...others }) => others);
          }}
          multiline
          maxLength={600}
        />
        <Text style={[typography.small, styles.count, { color: palette.textMuted }]}>
          {t("profile.aboutCount", {
            count: Array.from(about).length,
            max: profileRules.aboutMaxLength,
          })}
        </Text>
      </View>
      <View style={styles.languages}>
        <Text style={[typography.label, { color: palette.text }]}>{t("profile.languages")}</Text>
        <View style={styles.chips}>
          {spokenLanguages.map((language) => (
            <Chip
              key={language}
              label={languageNames[locale][language]}
              selected={languages.includes(language)}
              onToggle={() => {
                toggle(language);
              }}
            />
          ))}
        </View>
        {errors.languages === undefined ? null : (
          <Text
            accessibilityLiveRegion="polite"
            style={[typography.small, { color: palette.error }]}
          >
            {errors.languages}
          </Text>
        )}
      </View>
      <Notice message={error} />
      <Button label={t("profile.save")} busy={busy} onPress={() => void save()} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  about: { gap: spacing.xs },
  count: { alignSelf: "flex-end" },
  languages: { gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
