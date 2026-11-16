import { checkNote, type TripPreferences } from "@shareride/domain";
import { useState } from "react";
import { Body, Heading } from "@/components/text";
import { ChangePartScreen, WithTripToChange, type TripToChange } from "@/driver-trip/change-screen";
import { useLanguage } from "@/i18n/language";
import { NoteField, PreferenceChoices } from "@/trips/preference-fields";

/**
 * A published trip's preferences and note (spec 6, 3.2): shown on the
 * trip, with no notification. The note never holds contact details (R3.10).
 */
export default function EditDetailsScreen() {
  const { t } = useLanguage();
  return (
    <WithTripToChange title={t("trip.editDetailsAction")}>
      {(trip) => <EditDetails trip={trip} />}
    </WithTripToChange>
  );
}

function EditDetails({ trip }: { readonly trip: TripToChange }) {
  const { t } = useLanguage();
  const [preferences, setPreferences] = useState<TripPreferences>(trip.preferences);
  const [note, setNote] = useState(trip.note);
  const trimmed = note.trim();
  const same =
    trimmed === trip.note.trim() &&
    (Object.keys(preferences) as (keyof TripPreferences)[]).every(
      (key) => preferences[key] === trip.preferences[key],
    );
  return (
    <ChangePartScreen
      trip={trip}
      title={t("trip.editDetailsAction")}
      change={same ? null : { kind: "details", preferences, note: trimmed }}
      blocked={checkNote(note).length > 0}
    >
      <Body align="start">{t("trip.editDetailsHelp")}</Body>
      <Heading>{t("trip.prefs.title")}</Heading>
      <PreferenceChoices preferences={preferences} onChange={setPreferences} />
      <NoteField note={note} onChange={setNote} />
    </ChangePartScreen>
  );
}
