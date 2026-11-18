import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  edges,
  maxContentWidth,
  pageMaxWidth,
  radii,
  sidePanelFrom,
  sidePanelWidth,
  spacing,
} from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * A full screen with safe-area padding. On wide screens (web, tablets) the
 * content sits in a centred column (spec 1, section 5). A `footer`, such as
 * a step's main button, stays at the bottom while the rest scrolls: the
 * `BottomBar` of spec 15, section 5.2. With `footerBeside`, wide screens
 * show the footer in a panel beside the column instead (section 4.8).
 * Wide screens show an `aside`, such as a map, beside the column; phones
 * leave it out, and the screen shows it its own way (see `useWideScreen`).
 * With `width="page"`, wide screens give the content a page instead of the
 * column, for `Columns` and `Grid` to fill (spec 18, 3.2); the bottom bar
 * keeps the column.
 * With `stickToEnd`, as for a conversation, the screen opens at its end and
 * stays there as it grows while the reader is there, not while they read
 * further up; a new `endKey`, such as my own message on its way, brings it
 * back to the end.
 */
export function Screen({
  children,
  footer,
  footerBeside = false,
  aside,
  width = "column",
  stickToEnd = false,
  endKey,
}: {
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly footerBeside?: boolean;
  readonly aside?: ReactNode;
  readonly width?: "column" | "page";
  readonly stickToEnd?: boolean;
  readonly endKey?: string | undefined;
}) {
  const palette = usePalette();
  const wide = useWideScreen();
  // An aside takes the side, so a footer then stays in the bottom bar.
  const beside = footer !== undefined && footerBeside && wide && aside === undefined;
  const { scrollRef, scroll, keyboardRoom } = useRevealing();
  const safeEdges = useContext(ScreenEdgesContext);
  // The height the screen scrolls in: the window less any bar above it.
  const [viewHeight, setViewHeight] = useState<number | null>(null);
  // With `stickToEnd`: whether the reader is at the end, and whether to go
  // there at the next change in size whatever they read.
  const atEnd = useRef(true);
  const toEnd = useRef(false);
  useLayoutEffect(() => {
    if (endKey !== undefined) toEnd.current = true;
  }, [endKey]);
  return (
    <SafeAreaView
      edges={safeEdges}
      style={[styles.safeArea, { backgroundColor: palette.background }]}
    >
      {/* "handled": with the keyboard open, a tap on a button acts at once. */}
      <ScrollView
        ref={scrollRef}
        testID="screen-scroll"
        onLayout={
          // Only the web's sticky aside and side column use the height. It
          // is measured from the start, as they can come later, with data.
          Platform.OS === "web"
            ? (event) => {
                setViewHeight(event.nativeEvent.layout.height);
              }
            : undefined
        }
        style={wide ? evenGutterOnWeb : undefined}
        contentContainerStyle={[styles.scroll, { paddingBottom: spacing.md + keyboardRoom }]}
        keyboardShouldPersistTaps="handled"
        {...(stickToEnd
          ? {
              scrollEventThrottle: 100,
              onScroll: ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
                const { contentOffset, layoutMeasurement, contentSize } = nativeEvent;
                atEnd.current =
                  contentOffset.y + layoutMeasurement.height >= contentSize.height - spacing.xxl;
              },
              onContentSizeChange: () => {
                if (!atEnd.current && !toEnd.current) return;
                toEnd.current = false;
                atEnd.current = true;
                scrollRef.current?.scrollToEnd({ animated: false });
              },
            }
          : {})}
      >
        <ScreenScrollContext.Provider value={scroll}>
          <ScreenViewHeightContext.Provider value={viewHeight}>
            {aside !== undefined && wide ? (
              <View style={[styles.wide, styles.wideWithAside]}>
                <View style={styles.asideColumn}>{children}</View>
                <View testID="aside" style={[styles.aside, stickyOnWeb(viewHeight)]}>
                  {aside}
                </View>
              </View>
            ) : beside ? (
              <View style={styles.wide}>
                <View style={styles.wideColumn}>{children}</View>
                <View
                  testID="side-panel"
                  style={[
                    styles.panel,
                    {
                      backgroundColor: palette.surface,
                      borderColor: palette.border,
                      borderBottomColor: palette.edge,
                    },
                  ]}
                >
                  {footer}
                </View>
              </View>
            ) : width === "page" && wide ? (
              <View testID="page" style={styles.page}>
                {children}
              </View>
            ) : (
              <View style={styles.column}>{children}</View>
            )}
          </ScreenViewHeightContext.Provider>
        </ScreenScrollContext.Provider>
      </ScrollView>
      {footer === undefined || beside ? null : (
        <View
          testID="bottom-bar"
          style={[styles.bar, { backgroundColor: palette.surface, borderTopColor: palette.border }]}
        >
          <View style={styles.barColumn}>{footer}</View>
        </View>
      )}
    </SafeAreaView>
  );
}

type ViewRef = ComponentRef<typeof View>;

const allEdges: readonly Edge[] = ["top", "right", "bottom", "left"];
const ScreenEdgesContext = createContext<readonly Edge[]>(allEdges);

/**
 * The edges of the safe area screens inside pad. A bar that pads an edge
 * itself, such as the tab bar at the bottom, leaves it out.
 */
export const ScreenEdges = ScreenEdgesContext.Provider;

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

/** Whether the window is wide enough for a panel beside the column. */
export function useWideScreen() {
  return useWindowDimensions().width >= sidePanelFrom;
}

/**
 * On the web, a wide screen keeps room for its scrollbar at both sides,
 * where the browser's scrollbar takes room at all. So the page stays in the
 * middle of the window, under the top bar's content (spec 18, 3.3), and
 * does not move when it grows long enough to scroll.
 */
const evenGutterOnWeb: object =
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
  scroll: { flexGrow: 1, alignItems: "center", padding: spacing.md },
  column: { flex: 1, width: "100%", maxWidth: maxContentWidth, gap: spacing.md },
  page: { flex: 1, width: "100%", maxWidth: pageMaxWidth, gap: spacing.md },
  bar: { borderTopWidth: controlOutline, padding: spacing.md, alignItems: "center" },
  barColumn: { width: "100%", maxWidth: maxContentWidth, gap: spacing.sm },
  wide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.lg,
    width: "100%",
    maxWidth: maxContentWidth + spacing.lg + sidePanelWidth,
  },
  wideColumn: { flex: 1, gap: spacing.md },
  wideWithAside: { maxWidth: maxContentWidth + spacing.lg + asideMaxWidth },
  asideColumn: { flex: 1, maxWidth: maxContentWidth, gap: spacing.md },
  aside: { flex: 1, maxWidth: asideMaxWidth, gap: spacing.md },
  panel: {
    width: sidePanelWidth,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radii.card,
    borderWidth: controlOutline,
    borderBottomWidth: edges.card,
  },
});
