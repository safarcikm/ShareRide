import { useRef, type ComponentRef, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { evenGutterOnWeb, useScreenEdges, useStickToEnd, useWideScreen } from "@/components/screen";
import { Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { chunky } from "@/theme/pressable";
import { controlOutline, edges, listPaneWidth, pageMaxWidth, radii, spacing } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * Messages on a wide screen (spec 18, 3.11): one card across the page, as
 * tall as the window allows, with my conversations (`list`) in a pane at
 * the left and what is open (`children`, usually a `Pane`) in the rest.
 * Each pane scrolls on its own, so the list stays while a conversation is
 * read. Without `children` the list has the whole card.
 *
 * On a phone only `children` show, as a screen of their own; they keep
 * their place in the tree, so a window that turns narrow or wide keeps the
 * conversation it has loaded.
 */
export function Panes({
  list,
  children,
}: {
  readonly list: ReactNode;
  readonly children?: ReactNode;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const wide = useWideScreen();
  const safeEdges = useScreenEdges();
  const card = chunky(edges.card, palette.edge, false);
  return (
    <SafeAreaView
      edges={wide ? safeEdges : noEdges}
      style={[styles.fill, wide ? { backgroundColor: palette.background } : null]}
    >
      <View style={wide ? [styles.frame, evenGutterOnWeb] : styles.fill}>
        <View
          {...(wide ? { testID: "panes" } : {})}
          style={
            wide ? [styles.card, card.outer, { backgroundColor: palette.surface }] : styles.fill
          }
        >
          {wide ? (
            <View
              key="list"
              testID="panes-list"
              style={
                children === undefined
                  ? styles.fill
                  : [styles.list, { borderRightColor: palette.border }]
              }
            >
              <View style={styles.listTitle}>
                <Title align="start">{t("chat.title")}</Title>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled">{list}</ScrollView>
            </View>
          ) : null}
          {children === undefined ? null : (
            <View
              key="open"
              {...(wide ? { testID: "panes-open" } : {})}
              style={wide ? styles.open : styles.fill}
            >
              {children}
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

/**
 * What is open in `Panes`, on a wide screen: a `header` that stays, such as
 * who the conversation is with; the rest, which scrolls, opens at its end
 * and follows it as a `Screen` with `stickToEnd` does; and a `footer` that
 * stays at the bottom, such as the field to write in.
 */
export function Pane({
  header,
  footer,
  endKey,
  children,
}: {
  readonly header?: ReactNode;
  readonly footer?: ReactNode;
  readonly endKey?: string | undefined;
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const sticking = useStickToEnd(scrollRef, true, endKey);
  return (
    <>
      {header === undefined ? null : (
        <View style={[styles.header, { borderBottomColor: palette.border }]}>{header}</View>
      )}
      <ScrollView
        ref={scrollRef}
        testID="pane-scroll"
        style={[styles.fill, { backgroundColor: palette.background }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        {...sticking}
      >
        {children}
      </ScrollView>
      {footer === undefined ? null : (
        <View style={[styles.footer, { borderTopColor: palette.border }]}>{footer}</View>
      )}
    </>
  );
}

const noEdges: readonly Edge[] = [];

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // `overflow`: the frame never scrolls, and a browser keeps the room of
  // `evenGutterOnWeb` only for a part that could. With it the card lines
  // up with the top bar and with every other page.
  frame: { flex: 1, alignItems: "center", padding: spacing.md, overflow: "hidden" },
  card: {
    flex: 1,
    flexDirection: "row",
    width: "100%",
    maxWidth: pageMaxWidth,
    borderRadius: radii.card,
    overflow: "hidden",
  },
  list: { width: listPaneWidth, borderRightWidth: controlOutline },
  listTitle: { padding: spacing.md },
  open: { flex: 1 },
  header: { padding: spacing.md, gap: spacing.sm, borderBottomWidth: controlOutline },
  content: { flexGrow: 1, padding: spacing.md, gap: spacing.md },
  footer: { padding: spacing.md, gap: spacing.sm, borderTopWidth: controlOutline },
});
