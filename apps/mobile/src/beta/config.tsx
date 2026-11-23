import { configRoute, type Config } from "@shareride/contracts";
import {
  defaultCancellationSettings,
  defaultReliabilitySettings,
  defaultTripSettings,
  maxMoveMinutes,
} from "@shareride/domain";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useMe, useSession } from "@/auth/session";
import { Notice } from "@/components/notice";
import { Tag } from "@/components/tag";
import { useLanguage } from "@/i18n/language";
import { minTouchTarget } from "@/theme/tokens";
import { useOpenFeedback } from "./feedback";

/**
 * Until the API has answered, and if it cannot be reached: nothing special
 * to show, and the values the rules start with. Sign-in by email shows, as
 * on every server that sends email, rather than a line saying it is off.
 */
const quiet: Config = {
  beta: false,
  paused: [],
  maxSeats: defaultTripSettings.maxSeats,
  freeCancellationMinutes: defaultCancellationSettings.refundCutoffMinutes,
  maxMoveMinutes,
  reliabilityMonths: defaultReliabilitySettings.periodMonths,
  signInProviders: [],
  emailSignIn: true,
  passkeySignIn: false,
  payInPerson: false,
  analytics: null,
};

const ConfigContext = createContext<Config>(quiet);

// For a text made outside a component, such as a refusal's.
let lastMaxSeats = quiet.maxSeats;

/** The seat limit as the app last read it. In a component, use `useMaxSeats`. */
export const maxSeatsLastRead = (): number => lastMaxSeats;

/** How often the settings are read again. */
export const configEveryMs = 5 * 60_000;

/**
 * The operator's settings the app shows (spec 10, section 6): read when
 * the app opens and every 5 minutes after. The API decides everything itself; this only says
 * what to show, such as the Beta label.
 */
export function ConfigProvider({ children }: { readonly children: ReactNode }) {
  const session = useSession();
  const [config, setConfig] = useState<Config>(quiet);
  useEffect(() => {
    let current = true;
    const read = () => {
      session
        .call(configRoute, {})
        .then((result) => {
          if (!current || !result.ok) return;
          lastMaxSeats = result.data.maxSeats;
          setConfig(result.data);
        })
        // Not reached: the app shows what it last knew, or nothing special.
        .catch(() => undefined);
    };
    read();
    // Again every 5 minutes, as long as the API lets the answer be kept:
    // a pause shows, and goes, without the app being opened again.
    const timer = setInterval(read, configEveryMs);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [session]);
  return <ConfigContext value={config}>{children}</ConfigContext>;
}

export function useConfig(): Config {
  return useContext(ConfigContext);
}

/** What a text about cancelling or moving a trip says of the values as they are now. */
export function useTimings(): Pick<Config, "freeCancellationMinutes" | "maxMoveMinutes"> {
  return useContext(ConfigContext);
}

/** The months the reliability figure counts over, as the operator has it. */
export function useReliabilityMonths(): number {
  return useContext(ConfigContext).reliabilityMonths;
}

/**
 * Whether a booking made now is paid to the driver in person (rule M6, ADR
 * 0038). A booking already made says how it is paid itself.
 */
export function usePayInPerson(): boolean {
  return useContext(ConfigContext).payInPerson;
}

/** The seats a trip can offer and a booking can take, at most (rule S1), as the operator has it. */
export function useMaxSeats(): number {
  return useContext(ConfigContext).maxSeats;
}

/**
 * Where something the operator paused for a short while starts (spec 10,
 * 3.3): what is paused, and that what the person has is safe. The API
 * refuses with the same words if they try anyway.
 */
export function PausedBanner({ part }: { readonly part: Config["paused"][number] }) {
  const { t } = useLanguage();
  if (!useConfig().paused.includes(part)) return null;
  return <Notice kind="info" message={t(`error.${part}_paused`)} />;
}

/** The small "Beta" label beside the name during the beta (spec 12, 3.2.6; ADR 0035). */
export function BetaLabel() {
  const { t } = useLanguage();
  const me = useMe();
  const openFeedback = useOpenFeedback();
  if (!useConfig().beta) return null;
  const tag = <Tag label={t("beta.badge")} kind="info" />;
  // Signed in, the label opens Send feedback (spec 12, 3.3.1); the room
  // around it makes the small label a full touch target.
  if (me === null) return <View style={styles.label}>{tag}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("beta.badgeFeedback")}
      onPress={openFeedback}
      hitSlop={touchRoom}
      style={styles.label}
    >
      {tag}
    </Pressable>
  );
}

/** Around a label about 24 points high, to the smallest touch target. */
const touchRoom = Math.ceil((minTouchTarget - 24) / 2);

const styles = StyleSheet.create({ label: { alignSelf: "center" } });
