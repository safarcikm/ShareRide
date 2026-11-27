import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Keyboard,
  Platform,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import {
  asideMaxWidth,
  controlOutline,
  maxContentWidth,
  pageMaxWidth,
  shortWindowUnder,
  sidePanelFrom,
  spacing,
} from "@/theme/tokens";
import { onWebsite } from "@/lib/on-website";
import { usePalette } from "@/theme/use-palette";
import { HeldWithMain } from "./press-guard";
import { useRefresh, type Refresh } from "./refresh";
import { SiteFooter } from "./site-footer";
import { PutAgainContext } from "./takes-focus";
import { useLaidOutHeight } from "./window-height";

/**
 * A full screen with safe-area padding. On wide screens (web, tablets) the
 * content sits in a centred column (spec 1, section 5). A `footer`, such as
 * a step's main button, stays at the bottom while the rest scrolls: the
 * `BottomBar` of spec 15, section 5.2. A part of the page that keeps its
 * own state, as a form does, puts its main button there with `InBar`.
 * A `header`, as the top of a conversation is (spec 31, 3.13), stays at the
 * top the same way, on the surface's colour with a line under it, and the
 * room the screen leaves for the status bar has that colour too. What
 * stands `overFooter`, as a conversation's quick answers do, stays over the
 * bar on the screen's own ground.
 * Wide screens show an `aside`, such as a map, beside the column; phones
 * leave it out, and the screen shows it its own way (see `useWideScreen`).
 * With `width="page"`, wide screens give the content a page instead of the
 * column, for `Columns` and `Grid` to fill (spec 18, 3.2); the bottom bar
 * keeps the column.
 * With `stickToEnd`, as for a conversation, the screen opens at its end and
 * stays there as it grows while the reader is there, not while they read
 * further up; a new `endKey`, such as my own message on its way, brings it
 * back to the end.
 * With `refresh`, pulling down at the top loads the screen again, with a
 * spinner and then "Updated" at the top (spec 16, 3.9); a new
 * `refreshAsked` count, such as from pressing the logo, does the same from
 * the top of the screen.
 * A `backdrop`, such as the front page's Iceland scene, is drawn behind the
 * top of the content, from the screen's edges, and scrolls with it; it
 * takes no presses. With `topColour`, the room the screen leaves at its top
 * for the status bar or a notch has that colour, such as the backdrop's sky,
 * rather than the screen's.
 * With `siteFooter`, a public page of the website ends with the website's
 * footer (spec 30, 3.3), after the content and across the window, at the
 * window's bottom edge when the page is shorter; the phone apps have none.
 */
export function Screen({
  children,
  header,
  footer,
  overFooter,
  aside,
  width = "column",
  stickToEnd = false,
  endKey,
  refresh,
  refreshAsked,
  backdrop,
  topColour,
  siteFooter = false,
}: {
  readonly children: ReactNode;
  readonly header?: ReactNode;
  readonly footer?: ReactNode;
  readonly overFooter?: ReactNode;
  readonly aside?: ReactNode;
  readonly width?: "column" | "page";
  readonly stickToEnd?: boolean;
  readonly endKey?: string | undefined;
  readonly refresh?: Refresh | undefined;
  readonly refreshAsked?: number | undefined;
  readonly backdrop?: ReactNode;
  readonly topColour?: string;
  readonly siteFooter?: boolean;
}) {
  const palette = usePalette();
  const wide = useWideScreen();
  const { scrollRef, scroll, keyboardRoom } = useRevealing();
  const safeEdges = useContext(ScreenEdgesContext);
  // The height the screen scrolls in: the window less any bar above it.
  const [viewHeight, setViewHeight] = useState<number | null>(null);
  const { onLayout: followsEnd, ...sticking } = useStickToEnd(scrollRef, stickToEnd, endKey);
  const refreshing = useRefresh({ refresh, asked: refreshAsked, scrollRef });
  const [inBar] = useState(barSlot);
  // On a short window the bar joins the end of the page and scrolls with
  // it (spec 31, 3.20). A conversation's field stays under its messages.
  const barJoins = useShortWindow() && !stickToEnd;
  // Once it has changed place, what a bar holds as it is put there is
  // what the other held, and did not just appear (`PutAgainContext`).
  const [place, setPlace] = useState({ joins: barJoins, moved: false });
  if (place.joins !== barJoins) setPlace({ joins: barJoins, moved: true });
  return (
    <SafeAreaView
      testID="screen-safe-area"
      edges={safeEdges}
      style={[
        styles.safeArea,
        {
          backgroundColor:
            topColour ?? (header === undefined ? palette.background : palette.surface),
        },
      ]}
    >
      {header === undefined ? null : (
        <View
          testID="screen-top-bar"
          style={[
            styles.top,
            { backgroundColor: palette.surface, borderBottomColor: palette.border },
          ]}
        >
          <View style={styles.barColumn}>{header}</View>
        </View>
      )}
      {/* The scroll and, over its top, what a refresh shows. */}
      <View
        testID="screen-scroll-area"
        style={[styles.scrollArea, { backgroundColor: palette.background }]}
      >
        {/* "handled": with the keyboard open, a tap on a button acts at once. */}
        <ScrollView
          ref={scrollRef}
          testID="screen-scroll"
          refreshControl={refreshing.control}
          onLayout={(event) => {
            // Only the web's sticky aside and side column use the height. It
            // is measured from the start, as they can come later, with data.
            if (Platform.OS === "web") setViewHeight(event.nativeEvent.layout.height);
            followsEnd?.();
          }}
          style={wide ? evenGutterOnWeb : undefined}
          contentContainerStyle={[styles.scroll, { paddingBottom: spacing.md + keyboardRoom }]}
          keyboardShouldPersistTaps="handled"
          {...sticking}
        >
          {backdrop === undefined ? null : (
            <View testID="screen-backdrop" pointerEvents="none" style={styles.backdrop}>
              {backdrop}
            </View>
          )}
          <ScreenScrollContext.Provider value={scroll}>
            <BarSlotContext.Provider value={inBar}>
              <ScreenViewHeightContext.Provider value={viewHeight}>
                {aside !== undefined && wide ? (
                  <View style={styles.wide}>
                    <View style={styles.asideColumn}>{children}</View>
                    <View testID="aside" style={[styles.aside, stickyOnWeb(viewHeight)]}>
                      {aside}
                    </View>
                  </View>
                ) : width === "page" && wide ? (
                  <View testID="page" style={styles.page}>
                    {children}
                  </View>
                ) : (
                  <View style={styles.column}>{children}</View>
                )}
                {barJoins ? (
                  <BottomBar footer={footer} inBar={inBar} joined moved={place.moved} />
                ) : null}
                {siteFooter && onWebsite() ? <SiteFooter /> : null}
              </ScreenViewHeightContext.Provider>
            </BarSlotContext.Provider>
          </ScreenScrollContext.Provider>
        </ScrollView>
        {refreshing.mark}
      </View>
      {overFooter === undefined ? null : (
        <View testID="over-bar" style={[styles.overBar, { backgroundColor: palette.background }]}>
          <View style={styles.barColumn}>{overFooter}</View>
        </View>
      )}
      {barJoins ? null : <BottomBar footer={footer} inBar={inBar} moved={place.moved} />}
    </SafeAreaView>
  );
}

/**
 * What the parts of a screen have put in its bar, each under its own key,
 * in the order they came. Only the bar listens: a part that puts something
 * there again, as it does each time it is drawn, draws nothing else again.
 */
interface BarSlot {
  readonly put: (key: string, part: ReactNode) => void;
  readonly take: (key: string) => void;
  readonly held: () => ReadonlyMap<string, ReactNode>;
  readonly listen: (changed: () => void) => () => void;
}

function barSlot(): BarSlot {
  let held: ReadonlyMap<string, ReactNode> = new Map();
  const listeners = new Set<() => void>();
  const hold = (next: ReadonlyMap<string, ReactNode>) => {
    held = next;
    listeners.forEach((changed) => {
      changed();
    });
  };
  return {
    put: (key, part) => {
      hold(new Map(held).set(key, part));
    },
    take: (key) => {
      const next = new Map(held);
      if (next.delete(key)) hold(next);
    },
    held: () => held,
    listen: (changed) => {
      listeners.add(changed);
      return () => {
        listeners.delete(changed);
      };
    },
  };
}

const BarSlotContext = createContext<BarSlot | null>(null);

/**
 * Shows what it holds in the bar at the bottom of the screen around it,
 * and not where it stands: for the main button of a part that keeps its
 * own state, such as a form's "Save" or the button that confirms with a
 * code (spec 31, R31.1). The button stays the part's own, with the part's
 * state. A screen's own `footer` comes before it. With no `Screen` around
 * it, as in a part's own test, what it holds stays where it stands.
 *
 * What it holds is drawn by the screen: it reads nothing a part between
 * the screen and here provides, such as a card of rows.
 */
export function InBar({ children }: { readonly children: ReactNode }) {
  const slot = useContext(BarSlotContext);
  const key = useId();
  // Each time the part is drawn, as what it holds was made anew.
  useLayoutEffect(() => {
    slot?.put(key, children);
  });
  useLayoutEffect(
    () => () => {
      slot?.take(key);
    },
    [slot, key],
  );
  return slot === null ? children : null;
}

/**
 * The bar at the bottom: the screen's `footer`, then what its parts put there.
 *
 * It listens from its layout effect on, and looks again there: the parts
 * put what they hold in their layout effects, which run before the bar's
 * when a screen first shows, and the bar is drawn again before anything is
 * painted. So a screen never shows a first frame without its bar.
 * (`useSyncExternalStore` listens only once the frame is painted.)
 */
function BottomBar({
  footer,
  inBar,
  joined = false,
  moved = false,
}: {
  readonly footer: ReactNode;
  readonly inBar: BarSlot;
  /** At the end of the page, in its column, with no band of its own. */
  readonly joined?: boolean;
  /** The screen's bar changed place, and this is where it is now. */
  readonly moved?: boolean;
}) {
  const palette = usePalette();
  const [held, setHeld] = useState(inBar.held);
  // A notice the bar held where it was takes no focus as it is put here:
  // focus may be in a field that is being mended, with the keyboard up.
  // What comes once the bar is in place takes it as anywhere.
  const putAgain = useRef(moved);
  useEffect(() => {
    putAgain.current = false;
  }, []);
  useLayoutEffect(() => {
    const look = () => {
      setHeld(inBar.held());
    };
    look();
    return inBar.listen(look);
  }, [inBar]);
  if (footer === undefined && held.size === 0) return null;
  return (
    <View
      testID="bottom-bar"
      style={
        joined
          ? styles.joinedBar
          : [styles.bar, { backgroundColor: palette.surface, borderTopColor: palette.border }]
      }
    >
      <View style={styles.barColumn}>
        {/* A second press meant for the bar's button lands on none of them (spec 31, 3.20). */}
        <HeldWithMain>
          <PutAgainContext.Provider value={putAgain}>
            {footer}
            {[...held].map(([key, part]) => (
              <Fragment key={key}>{part}</Fragment>
            ))}
          </PutAgainContext.Provider>
        </HeldWithMain>
      </View>
    </View>
  );
}

type ViewRef = ComponentRef<typeof View>;

/**
 * What a scroll takes to open at its end and stay there as it grows, as a
 * conversation does (`on`): it follows only while the reader is at the
 * end, not while they read further up, and a new `endKey`, such as my own
 * message on its way, brings it back to the end whatever they read. It
 * stays at its end too when it gets less height itself, as when the field
 * under it grows with a second line: the last message is not left under
 * the bar.
 *
 * The reader leaves the end by going up, and only so. A browser says a
 * scroll's sizes as they are when the scroll is heard, which can be after
 * what it holds grew and before its new size is told: being short of the
 * end then is not the reader's doing, and the scroll still follows.
 */
export function useStickToEnd(
  scrollRef: RefObject<ComponentRef<typeof ScrollView> | null>,
  on: boolean,
  endKey: string | undefined,
): {
  readonly scrollEventThrottle?: number;
  readonly onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  readonly onContentSizeChange?: () => void;
  readonly onLayout?: () => void;
} {
  // Whether the reader is at the end, and whether to go there at the next
  // change in size whatever they read.
  const atEnd = useRef(true);
  const toEnd = useRef(false);
  // How far down the last scroll was.
  const lastY = useRef(0);
  useLayoutEffect(() => {
    if (endKey !== undefined) toEnd.current = true;
  }, [endKey]);
  return useMemo(
    () =>
      on
        ? {
            scrollEventThrottle: 100,
            onScroll: ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
              const { contentOffset, layoutMeasurement, contentSize } = nativeEvent;
              const wentUp = contentOffset.y < lastY.current - 1;
              lastY.current = contentOffset.y;
              if (contentOffset.y + layoutMeasurement.height >= contentSize.height - spacing.xxl) {
                atEnd.current = true;
              } else if (wentUp) {
                atEnd.current = false;
              }
            },
            onContentSizeChange: () => {
              if (!atEnd.current && !toEnd.current) return;
              toEnd.current = false;
              atEnd.current = true;
              scrollRef.current?.scrollToEnd({ animated: false });
            },
            // Its own height changed and what it holds did not.
            onLayout: () => {
              if (atEnd.current) scrollRef.current?.scrollToEnd({ animated: false });
            },
          }
        : {},
    [on, scrollRef],
  );
}

const allEdges: readonly Edge[] = ["top", "right", "bottom", "left"];
const ScreenEdgesContext = createContext<readonly Edge[]>(allEdges);

/**
 * The edges of the safe area screens inside pad. A bar that pads an edge
 * itself, such as the tab bar at the bottom, leaves it out.
 */
export const ScreenEdges = ScreenEdgesContext.Provider;

/** The edges a part that stands in for a `Screen` pads, as a `Screen` does. */
export function useScreenEdges(): readonly Edge[] {
  return useContext(ScreenEdgesContext);
}

/** Lets a part of the screen ask to be scrolled up to the top, above the keyboard. */
export interface ScreenScroll {
  /**
   * On phones, scrolls `target` to near the top of the screen and keeps
   * room under it for the keyboard, so what it shows below itself is not
   * hidden. Returns a function that ends this.
   */
  readonly reveal: (target: RefObject<ViewRef | null>) => () => void;
}

const ScreenScrollContext = createContext<ScreenScroll | null>(null);

/** The screen's scroll, or null outside a `Screen`. */
export function useScreenScroll(): ScreenScroll | null {
  return useContext(ScreenScrollContext);
}

/**
 * Scrolls a part being revealed to near the top. While it is, the content
 * gets room at the bottom as tall as the keyboard, so the part can be
 * scrolled that far even on a short page. On the web there is no keyboard
 * to make room for, and nothing scrolls.
 */
function useRevealing() {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const target = useRef<RefObject<ViewRef | null> | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [keyboard, setKeyboard] = useState(0);

  useEffect(() => {
    if (Platform.OS === "web") return undefined;
    const shown = Keyboard.addListener("keyboardDidShow", (event) => {
      setKeyboard(event.endCoordinates.height);
    });
    const hidden = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboard(0);
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  const scrollToTarget = useCallback(() => {
    const view = target.current?.current;
    const content = scrollRef.current?.getInnerViewRef();
    if (Platform.OS === "web" || view === null || view === undefined) return;
    if (content === null || content === undefined) return;
    view.measureLayout(content, (_x, y) => {
      // Room for the label above the part, as in the screen's own padding.
      scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing.xl), animated: true });
    });
  }, []);

  // Again once the keyboard is up and the room under the content is there.
  useEffect(() => {
    if (revealing) scrollToTarget();
  }, [revealing, keyboard, scrollToTarget]);

  const scroll = useMemo<ScreenScroll>(
    () => ({
      reveal: (ref) => {
        target.current = ref;
        setRevealing(true);
        scrollToTarget();
        return () => {
          if (target.current !== ref) return;
          target.current = null;
          setRevealing(false);
        };
      },
    }),
    [scrollToTarget],
  );
  return { scrollRef, scroll, keyboardRoom: revealing ? keyboard : 0 };
}

/**
 * Whether the window is short: a phone on its side, or a laptop zoomed far
 * in. A keyboard over the page of a phone's browser does not make it so.
 */
export function useShortWindow() {
  return useLaidOutHeight() < shortWindowUnder;
}

/** Whether the window is wide enough for a panel beside the column. */
export function useWideScreen() {
  return useWindowDimensions().width >= sidePanelFrom;
}

/**
 * On the web, a wide screen keeps room for its scrollbar at both sides,
 * where the browser's scrollbar takes room at all. So the page stays in the
 * middle of the window and does not move when it grows long enough to
 * scroll. The top bar keeps the same room, so what it holds stays over the
 * page's edges at every width (spec 18, 3.3).
 */
export const evenGutterOnWeb: object =
  Platform.OS === "web" ? { scrollbarGutter: "stable both-edges" } : {};

const ScreenViewHeightContext = createContext<number | null>(null);

/**
 * The height the screen scrolls in, for a part that stays in view with
 * `stickyOnWeb`. Null until it is measured, on phones and outside a `Screen`.
 */
export function useScreenViewHeight(): number | null {
  return useContext(ScreenViewHeightContext);
}

/**
 * On the web, the aside or side column stays in view while the rest
 * scrolls, and scrolls on its own when it is taller than the screen's
 * scroll, which is the window less any bar above it, such as the top bar.
 */
export function stickyOnWeb(viewHeight: number | null): object {
  if (Platform.OS !== "web") return {};
  const room = 2 * spacing.md;
  return {
    position: "sticky",
    top: spacing.md,
    maxHeight: viewHeight === null ? `calc(100vh - ${String(room)}px)` : viewHeight - room,
    overflowY: "auto",
  };
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollArea: { flex: 1 },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, overflow: "hidden" },
  scroll: { flexGrow: 1, alignItems: "center", padding: spacing.md },
  column: { flex: 1, width: "100%", maxWidth: maxContentWidth, gap: spacing.md },
  page: { flex: 1, width: "100%", maxWidth: pageMaxWidth, gap: spacing.md },
  top: {
    borderBottomWidth: controlOutline,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.ms,
    alignItems: "center",
  },
  overBar: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, alignItems: "center" },
  bar: { borderTopWidth: controlOutline, padding: spacing.md, alignItems: "center" },
  // In the page's padding already, a step under what the page ends with.
  joinedBar: { width: "100%", paddingTop: spacing.md, alignItems: "center" },
  barColumn: { width: "100%", maxWidth: maxContentWidth, gap: spacing.sm },
  wide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.lg,
    width: "100%",
    maxWidth: pageMaxWidth,
  },
  asideColumn: { flex: 1, maxWidth: maxContentWidth, gap: spacing.md },
  aside: { flex: 1, maxWidth: asideMaxWidth, gap: spacing.md },
});
