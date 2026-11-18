import { Accelerometer } from "expo-sensors";
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { useMe } from "@/auth/session";
import { Switch } from "@/components/switch";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { readPreference, writePreference } from "@/lib/preferences";
import { useOpenFeedback } from "./feedback";
import { createShakeDetector } from "./shake-rule";

// Shake the phone to send feedback (spec 12, 3.3.1): on phones only, for a
// signed-in person, and off when they turned it off in Settings. The
// choice stays on the device.

const preferenceKey = "shareride.shakeForFeedback";
const readingsEveryMs = 100;

/** Whether shaking opens the form here at all: phones only. */
export const canShake = Platform.OS === "ios" || Platform.OS === "android";

type Listener = (on: boolean) => void;
const listeners = new Set<Listener>();

/** The choice, on unless turned off; undefined until it is read. */
function useShakeChoice(): [boolean | undefined, (on: boolean) => void] {
  const [on, setOn] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let current = true;
    void readPreference(preferenceKey).then((stored) => {
      if (current) setOn(stored !== "off");
    });
    listeners.add(setOn);
    return () => {
      current = false;
      listeners.delete(setOn);
    };
  }, []);
  const change = (next: boolean) => {
    for (const listener of listeners) listener(next);
    void writePreference(preferenceKey, next ? "on" : "off");
  };
  return [on, change];
}

/** Listens for a shake while the app is open; shows nothing. */
export function ShakeForFeedback() {
  const me = useMe();
  const [on] = useShakeChoice();
  const open = useOpenFeedback();
  // The listener stays as the screens change; it opens from the one on show.
  const latest = useRef(open);
  useEffect(() => {
    latest.current = open;
  }, [open]);
  const listening = canShake && me !== null && on === true;

  useEffect(() => {
    if (!listening) return;
    const detector = createShakeDetector();
    Accelerometer.setUpdateInterval(readingsEveryMs);
    const subscription = Accelerometer.addListener((reading) => {
      if (detector.reading(reading, Date.now())) latest.current();
    });
    return () => {
      subscription.remove();
    };
  }, [listening]);

  return null;
}

/** The "Shake to send feedback" switch in Settings; nothing on the web. */
export function ShakeSwitch() {
  const { t } = useLanguage();
  const [on, change] = useShakeChoice();
  if (!canShake || on === undefined) return null;
  const label = t("feedback.shake");
  const help = t("feedback.shakeHelp");
  return (
    <Switch
      label={label}
      spokenLabel={`${label}. ${help}`}
      value={on}
      onChange={change}
      below={<Body align="start">{help}</Body>}
    />
  );
}
