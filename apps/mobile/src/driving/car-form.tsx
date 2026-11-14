import { addVehicleRoute, updateVehicleRoute, type Vehicle } from "@shareride/contracts";
import {
  carColours,
  commonCarMakes,
  validateVehicle,
  vehicleRules,
  type CarColour,
  type VehicleError,
} from "@shareride/domain";
import type { Translate } from "@shareride/i18n";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { FieldError } from "@/components/field-error";
import { Notice } from "@/components/notice";
import { TextField } from "@/components/text-field";
import { useLanguage } from "@/i18n/language";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { colourKeys } from "./texts";

type Field = VehicleError["field"];

/** Suggested makes shown under the field as the driver types. */
const suggestionCount = 6;

function fieldError(t: Translate, field: Field): string {
  switch (field) {
    case "make":
      return t("vehicle.error.make", { max: vehicleRules.nameMaxLength });
    case "model":
      return t("vehicle.error.model", { max: vehicleRules.nameMaxLength });
    case "colour":
      return t("vehicle.error.colour");
    case "registration":
      return t("vehicle.error.registration");
  }
}

const isField = (path: unknown): path is Field =>
  path === "make" || path === "model" || path === "colour" || path === "registration";

/**
 * Add or edit a car (spec 3, screen 2): make with suggestions, model, a
 * colour from the list and the number plate, which can come later. The
 * rules are the domain's; the server checks them again and tidies the plate.
 */
export function CarForm({
  car,
  onSaved,
}: {
  /** The car to edit; a new car when left out. */
  readonly car?: Vehicle;
  readonly onSaved: () => void;
}) {
  const { t } = useLanguage();
  const session = useSession();
  const [make, setMake] = useState(car?.make ?? "");
  const [model, setModel] = useState(car?.model ?? "");
  const [colour, setColour] = useState<CarColour | null>(car?.colour ?? null);
  const [registration, setRegistration] = useState(car?.registration ?? "");
  const [invalid, setInvalid] = useState<Field | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const typed = make.trim().toLowerCase();
  const suggestions =
    typed === ""
      ? []
      : commonCarMakes
          .filter((known) => known.toLowerCase().startsWith(typed) && known !== make.trim())
          .slice(0, suggestionCount);
  const errorFor = (field: Field) => (invalid === field ? fieldError(t, field) : undefined);
  /** A change to a field clears its error at once; the next save checks again. */
  const changed =
    <T,>(field: Field, set: (value: T) => void) =>
    (value: T) => {
      set(value);
      if (invalid === field) setInvalid(null);
    };

  async function save() {
    const body = { make, model, colour: colour ?? "", registration };
    const checked = validateVehicle(body);
    if (!checked.ok) {
      setInvalid(checked.error.field);
      return;
    }
    setInvalid(null);
    setFailure(null);
    setBusy(true);
    const result =
      car === undefined
        ? await session.call(addVehicleRoute, { body })
        : await session.call(updateVehicleRoute, { params: { id: car.id }, body });
    setBusy(false);
    if (result.ok) {
      onSaved();
      return;
    }
    const path = result.error.details?.[0]?.path;
    if (result.error.code === "vehicle_invalid" && isField(path)) setInvalid(path);
    // Removed meanwhile, such as on another device.
    else if (result.status === 404) setFailure(t("vehicle.notFound"));
    else setFailure(errorText(t, result));
  }

  return (
    <>
      <View style={styles.group}>
        <TextField
          label={t("vehicle.make")}
          help={t("vehicle.makeHelp")}
          error={errorFor("make")}
          value={make}
          onChangeText={changed("make", setMake)}
          maxLength={vehicleRules.nameMaxLength}
          autoCapitalize="words"
        />
        {suggestions.length === 0 ? null : (
          <View style={styles.chips}>
            {suggestions.map((suggestion) => (
              <Chip
                key={suggestion}
                role="button"
                label={suggestion}
                selected={false}
                onToggle={() => {
                  changed("make", setMake)(suggestion);
                }}
              />
            ))}
          </View>
        )}
      </View>
      <TextField
        label={t("vehicle.model")}
        help={t("vehicle.modelHelp")}
        error={errorFor("model")}
        value={model}
        onChangeText={changed("model", setModel)}
        maxLength={vehicleRules.nameMaxLength}
        autoCapitalize="words"
      />
      <ColourChoice
        colour={colour}
        onChoose={changed("colour", setColour)}
        error={errorFor("colour")}
      />
      <TextField
        label={t("vehicle.registration")}
        help={`${t("vehicle.plateLater")} ${t("vehicle.platePrivate")}`}
        error={errorFor("registration")}
        value={registration}
        onChangeText={changed("registration", setRegistration)}
        maxLength={12}
        autoCapitalize="characters"
      />
      <Notice message={failure} />
      <Button label={t("vehicle.save")} busy={busy} onPress={() => void save()} />
    </>
  );
}

function ColourChoice({
  colour,
  onChoose,
  error,
}: {
  readonly colour: CarColour | null;
  readonly onChoose: (colour: CarColour) => void;
  readonly error: string | undefined;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const label = t("vehicle.colour");
  return (
    <View style={styles.group}>
      <Text style={[typography.label, { color: palette.text }]}>{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.chips}>
        {carColours.map((option) => (
          <Chip
            key={option}
            role="radio"
            label={t(colourKeys[option])}
            selected={colour === option}
            onToggle={() => {
              onChoose(option);
            }}
          />
        ))}
      </View>
      <FieldError message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
