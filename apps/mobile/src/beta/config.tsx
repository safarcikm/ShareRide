import { configRoute, type Config } from "@shareride/contracts";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useMe, useSession } from "@/auth/session";
import { Notice } from "@/components/notice";
import { Tag } from "@/components/tag";
import { useLanguage } from "@/i18n/language";
import { minTouchTarget } from "@/theme/tokens";
import { useOpenFeedback } from "./feedback";

/** Until the API has answered, and if it cannot be reached: nothing special to show. */
const quiet: Config = { beta: false, paused: [] };

const ConfigContext = createContext<Config>(quiet);

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
          if (current && result.ok) setConfig(result.data);
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

/** The small "Beta" label beside the name while the beta is closed (spec 12, 3.2.6). */
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
