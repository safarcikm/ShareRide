import { updateMeRoute, type Me } from "@shareride/contracts";
import {
  profileRules,
  spokenLanguages,
  validateProfileChanges,
  type ProfileError,
} from "@shareride/domain";
import { languageNames, type MessageKey, type Translate } from "@shareride/i18n";
import { useRef, useState, type ReactNode } from "react";
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
 * The languages that show before "More languages" (spec 16, 3.5 item 4):
 * the ones most spoken in Iceland and by its visitors, as on the approved
 * sketch. Languages already chosen show too.
 */
const commonLanguages = new Set<string>(["is", "en", "pl", "de", "es"]);

/**
 * First name, about and spoken languages (spec 1, section 3.5), checked with
 * the same rules as the API before saving. Photo and email come later.
 */
export function ProfileForm({
  me,
  onSaved,
  submitLabel,
  tickAppLanguage = false,
  foldAbout = false,
  afterFirstName,
  check,
  beforeSave,
  waiting = false,
  suggestedFirstName = null,
  children,
}: {
  readonly me: Me;
  /** After saving; the account in the session is already updated. */
  readonly onSaved?: (me: Me) => void;
  /** The main button; "Save profile" unless given. */
  readonly submitLabel?: string;
  /** A new profile starts with the app's language ticked, when none is chosen yet. */
  readonly tickAppLanguage?: boolean;
  /** Folds an empty About you behind "Add a few words about you (optional)". */
  readonly foldAbout?: boolean;
  /** Shown after the first name, such as the email at sign-up on the web. */
  readonly afterFirstName?: ReactNode;
  /** Runs with the fields' own checks; false stops the save, and the part shows why. */
  readonly check?: () => boolean;
  /**
   * Runs once the fields pass their checks, before saving, such as
   * accepting the terms first. A text stops the save and shows as the error.
   */
  readonly beforeSave?: () => Promise<string | null>;
  /** The main button shows busy, such as while the terms load. */
  readonly waiting?: boolean;
  /**
   * A first name to start with when the profile has none, such as the one
   * Google or Apple gave a new account (spec 19, 3.3); the person can change it.
   */
  readonly suggestedFirstName?: string | null;
  /** Shown after the fields and before the main button. */
  readonly children?: ReactNode;
}) {
  const { locale, t } = useLanguage();
  const session = useSession();
  const palette = usePalette();
  const [firstName, setFirstName] = useState(me.firstName ?? suggestedFirstName ?? "");
  const [about, setAbout] = useState(me.about ?? "");
  // A language a newer version added is kept off the form rather than refused.
  const [languages, setLanguages] = useState<readonly string[]>(() => {
    const known = me.languages.filter((language) => knownLanguages.has(language));
    return known.length > 0 || !tickAppLanguage || !knownLanguages.has(locale) ? known : [locale];
  });
  // The chips that show: the common ones and those chosen when the form
  // opened, so a chip never disappears when it is unticked.
  const [shown] = useState(() => new Set([...commonLanguages, ...languages]));
  const [allLanguages, setAllLanguages] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(!foldAbout || about !== "");
  const [aboutAsked, setAboutAsked] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<ProfileError["field"], string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);

  function showError(field: ProfileError["field"]) {
    setErrors({ [field]: fieldError(t, field) });
    if (field === "about") setAboutOpen(true);
  }

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
    // Both run, so every field that needs a change says so at once.
    const checked = check?.() ?? true;
    if (!valid.ok) {
      showError(valid.error.field);
      return;
    }
    if (!checked) return;
    saving.current = true;
    setBusy(true);
    const stop = (await beforeSave?.()) ?? null;
    if (stop !== null) {
      saving.current = false;
      setBusy(false);
      setError(stop);
      return;
    }
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
      showError(field);
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
      {afterFirstName}
      <View style={styles.languages}>
        <Text style={[typography.label, { color: palette.text }]}>{t("profile.languages")}</Text>
        <View style={styles.chips}>
          {[
            // The ones shown keep their place; "More languages" adds the rest after them.
            ...spokenLanguages.filter((language) => shown.has(language)),
            ...(allLanguages ? spokenLanguages.filter((language) => !shown.has(language)) : []),
          ].map((language) => (
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
        {allLanguages || spokenLanguages.every((language) => shown.has(language)) ? null : (
          <Button
            variant="text"
            label={t("profile.moreLanguages")}
            onPress={() => {
              setAllLanguages(true);
            }}
          />
        )}
        {errors.languages === undefined ? null : (
          <Text
            accessibilityLiveRegion="polite"
            style={[typography.small, { color: palette.error }]}
          >
            {errors.languages}
          </Text>
        )}
      </View>
      {aboutOpen ? (
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
            autoFocus={aboutAsked}
          />
          <Text style={[typography.small, styles.count, { color: palette.textMuted }]}>
            {t("profile.aboutCount", {
              count: Array.from(about).length,
              max: profileRules.aboutMaxLength,
            })}
          </Text>
        </View>
      ) : (
        <Button
          variant="text"
          label={t("profile.addAbout")}
          onPress={() => {
            setAboutAsked(true);
            setAboutOpen(true);
          }}
        />
      )}
      {children}
      <Notice message={error} />
      <Button
        label={submitLabel ?? t("profile.save")}
        busy={busy || waiting}
        onPress={() => void save()}
      />
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
