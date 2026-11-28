import { CircleAlert, Check, RotateCw } from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentRef,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type RefreshControlProps,
  type ScrollView,
} from "react-native";
import { useLanguage } from "@/i18n/language";
import { iconSizes, radii, sizes, spacing, typography } from "@/theme/tokens";
import { cardLift } from "@/theme/pressable";
import { usePalette, useScheme } from "@/theme/use-palette";
import { Icon } from "./icon";
import { pullMost, pullReady, pullTrigger, usePullOnWeb } from "./pull-gesture";

/**
 * Loads what a screen shows again (spec 16, 3.9): true once the new answer
 * is on screen, false when it could not be loaded (the last one stays),
 * null when there is nothing to say, as the screen moved on to something
 * else meanwhile and loads that itself.
 */
export type Refresh = () => Promise<boolean | null>;

type Status =
  | { readonly kind: "idle" }
  /** `pull`: pulled down; `ask`: asked for, such as by pressing the logo. */
  | { readonly kind: "refreshing"; readonly by: "pull" | "ask" }
  | { readonly kind: "done"; readonly ok: boolean };

const idle: Status = { kind: "idle" };

/** How long "Updated" stays, in milliseconds: long enough to read, then it goes. */
const doneShownFor = 2000;

/**
 * Pull to refresh for a `Screen` (spec 16, 3.9). Pulled down at the top of
 * the screen, or asked for again by a new `asked` count (the logo), it runs
 * `refresh`. While it runs a spinner shows at the top: the phone's own when
 * pulled on a phone, our round mark on the web and when asked for. Then
 * "Updated", or "Couldn't update", shows there for two seconds and is read
 * out. Asked for, the screen first goes back to its top. Without `refresh`
 * nothing pulls.
 */
export function useRefresh({
  refresh,
  asked,
  scrollRef,
}: {
  readonly refresh: Refresh | undefined;
  readonly asked: number | undefined;
  readonly scrollRef: RefObject<ComponentRef<typeof ScrollView> | null>;
}): { readonly control: ReactElement<RefreshControlProps> | undefined; readonly mark: ReactNode } {
  const palette = usePalette();
  const [status, setStatus] = useState<Status>(idle);
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  });
  const busy = useRef(false);
  const open = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  const run = useCallback(async (by: "pull" | "ask") => {
    const refreshNow = latest.current;
    if (refreshNow === undefined || busy.current) return;
    busy.current = true;
    if (timer.current !== null) clearTimeout(timer.current);
    setStatus({ kind: "refreshing", by });
    const ok = await refreshNow().catch(() => false);
    busy.current = false;
    if (!open.current) return;
    if (ok === null) {
      setStatus(idle);
      return;
    }
    setStatus({ kind: "done", ok });
    timer.current = setTimeout(() => {
      setStatus(idle);
    }, doneShownFor);
  }, []);

  // Each new count asks again, not the one the screen opened with.
  const seen = useRef(asked);
  useEffect(() => {
    if (asked === seen.current) return;
    seen.current = asked;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    void run("ask");
  }, [asked, run, scrollRef]);

  const [pull] = useState(createPullStore);
  usePullOnWeb(scrollRef, refresh !== undefined, {
    move: (distance) => {
      if (!busy.current) pull.set(distance);
    },
    release: (distance) => {
      pull.set(0);
      if (pullReady(distance)) void run("pull");
    },
  });

  // A refresh under way finishes showing even if the screen stopped offering it.
  const mark =
    refresh === undefined && status.kind === "idle" ? null : (
      <RefreshMark status={status} pull={pull} />
    );
  if (refresh === undefined) return { control: undefined, mark };
  const control =
    Platform.OS === "web" ? undefined : (
      <RefreshControl
        testID="pull-to-refresh"
        refreshing={status.kind === "refreshing" && status.by === "pull"}
        onRefresh={() => void run("pull")}
        tintColor={palette.primary}
        colors={[palette.primary]}
        progressBackgroundColor={palette.surface}
      />
    );
  return { control, mark };
}

/** How far a finger on the web has pulled the mark down, for the mark alone to follow. */
interface PullStore {
  readonly get: () => number;
  readonly set: (distance: number) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

function createPullStore(): PullStore {
  let distance = 0;
  const listeners = new Set<() => void>();
  return {
    get: () => distance,
    set: (next) => {
      if (next === distance) return;
      distance = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * What shows at the top of the screen: the round mark coming down with the
 * finger, its arrow turning and going `primary` once letting go refreshes;
 * the spinner in it while refreshing; then what came of it. Taps go through
 * to the screen under it. On the web it is a live region, so the outcome is
 * read out; phones announce it.
 */
function RefreshMark({ status, pull }: { readonly status: Status; readonly pull: PullStore }) {
  const { t } = useLanguage();
  const palette = usePalette();
  const scheme = useScheme();
  const distance = useSyncExternalStore(pull.subscribe, pull.get, pull.get);
  const outcome =
    status.kind === "done" ? t(status.ok ? "refresh.updated" : "refresh.failed") : null;
  useEffect(() => {
    if (outcome !== null && Platform.OS !== "web") {
      AccessibilityInfo.announceForAccessibility(outcome);
    }
  }, [outcome, status]);

  const look = [{ backgroundColor: palette.surface }, cardLift(scheme).face];
  let shown: ReactNode = null;
  let down = restingAt;
  if (status.kind === "done") {
    shown = (
      <View testID="refresh-outcome" style={[styles.pill, look]}>
        <Icon
          icon={status.ok ? Check : CircleAlert}
          color={status.ok ? palette.primary : palette.error}
          size={iconSizes.inline}
        />
        <Text style={[typography.label, { color: palette.text }]}>{outcome}</Text>
      </View>
    );
  } else if (status.kind === "refreshing") {
    // A phone's own spinner shows while pulled there.
    if (status.by === "ask" || Platform.OS === "web") {
      shown = (
        <View style={[styles.round, look]}>
          <ActivityIndicator accessibilityLabel={t("refresh.updating")} color={palette.primary} />
        </View>
      );
    }
  } else if (distance > 0) {
    // From out of sight above the top down to the finger.
    down = distance - sizes.iconButton;
    const ready = pullReady(distance);
    shown = (
      <View testID="refresh-pull" style={[styles.round, look]}>
        <View style={{ transform: [{ rotate: `${String((distance / pullTrigger) * 270)}deg` }] }}>
          <Icon icon={RotateCw} color={ready ? palette.primary : palette.textMuted} />
        </View>
      </View>
    );
  }
  return (
    <View
      pointerEvents="none"
      style={styles.over}
      {...(Platform.OS === "web" ? { accessibilityLiveRegion: "polite" as const } : {})}
    >
      {shown === null ? null : <View style={{ transform: [{ translateY: down }] }}>{shown}</View>}
    </View>
  );
}

/** Where the mark rests while refreshing, and the outcome shows. */
const restingAt = spacing.md;

const styles = StyleSheet.create({
  // Over the top of the scroll, as high as the mark comes down; what is
  // above it stays hidden.
  over: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: pullMost + sizes.iconButton,
    alignItems: "center",
    overflow: "hidden",
  },
  round: {
    width: sizes.iconButton,
    height: sizes.iconButton,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    minHeight: sizes.iconButton,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.ms,
    borderRadius: radii.pill,
  },
});
